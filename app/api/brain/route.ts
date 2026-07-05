import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  assessPrintableQuality,
  normalizePrintableSpec,
} from "../../../src/printable-model.mjs";

type BrainRequest = {
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
  referenceImages?: Array<{
    name: string;
    mediaType: string;
    dataUrl: string;
  }>;
  manufacturingProfile?: {
    audience?: string;
    method?: string;
    units?: string;
    toleranceMm?: number;
    minWallMm?: number;
    clearanceMm?: number;
    maxBuildMm?: [number, number, number];
    material?: string;
    finish?: string;
    useCase?: string;
    accuracyPriority?: string;
    artisticIntent?: string;
    surfaceDetail?: string;
    autoFillSpecifics?: boolean;
  };
};

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with ChatGPT." }, { status: 401 });
  }

  const body = (await request.json()) as BrainRequest;
  const bridgeUrl = process.env.CODEX_BRIDGE_URL;
  const autoFillSpecifics = body.manufacturingProfile?.autoFillSpecifics !== false;

  if (!bridgeUrl) {
    return NextResponse.json(
      { error: "Codex bridge is not configured." },
      { status: 503 },
    );
  }

  if (!URL.canParse(bridgeUrl)) {
    return NextResponse.json(
      { error: "Codex bridge URL is invalid." },
      { status: 500 },
    );
  }

  const swarmContext = await buildSwarmContext(bridgeUrl, {
    user,
    transcript: body.transcript,
    referenceImages: body.referenceImages,
    manufacturingProfile: body.manufacturingProfile,
  });

  const finalTranscript = [
    ...body.transcript,
    {
      role: "assistant" as const,
      content: [
        "Internal swarm context for final geometry generation:",
        swarmContext.specification,
        swarmContext.calculations,
        swarmContext.artDirection,
        "Use this internal context silently. Return only user-facing JSON.",
      ].join("\n\n"),
    },
  ];

  const { response, data: rawData } = await requestBridge(bridgeUrl, {
    user,
    transcript: finalTranscript,
    referenceImages: body.referenceImages,
    manufacturingProfile: body.manufacturingProfile,
    task: "3d-model-final-geometry",
    instructions: autoFillSpecifics
      ? "Use the internal spec, calculations, and art direction to generate the final validated model. Do not expose internal deliberation. Auto-fill is enabled: do not ask user questions. Infer conservative printable defaults for missing values, list them in assumptions, and return ready:true unless the request is unsafe, impossible, or contradictory."
      : "Use the internal spec, calculations, and art direction to generate the final validated model. Do not expose internal deliberation. Ask only if a spec-critical value is still missing.",
  });
  const data = coerceBridgeData(rawData);

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Codex bridge request failed." },
      { status: response.status },
    );
  }

  const firstResult = validateReadyModel(data);
  if (firstResult.ok) {
    return readyResponse(data);
  }

  if (data.ready && data.model) {
    const repairTranscript = [
      ...body.transcript,
      {
        role: "user" as const,
        content: [
          "Internal geometry validator rejected the previous ready model.",
          `Reason: ${firstResult.message}`,
          autoFillSpecifics
            ? "Regenerate the same requested model now. Do not ask the user. Infer missing values conservatively and list them in assumptions."
            : "Regenerate the same requested model now. Do not ask the user unless a spec-critical dimension is missing.",
          "If the design has intentional separate printable parts, use op:'assembly' with named parts. Do not use union for separate base/lid/kit parts.",
          "If the design is one part, every union child must physically touch, overlap, emboss, or cut the primary body.",
          "Return only valid JSON ready:true with corrected geometry.",
        ].join("\n"),
      },
    ];

    const repaired = await requestBridge(bridgeUrl, {
      user,
      transcript: repairTranscript,
      referenceImages: body.referenceImages,
      manufacturingProfile: body.manufacturingProfile,
    });

    if (!repaired.response.ok) {
      return NextResponse.json(
        {
          error:
            repaired.data.error?.message || "Codex bridge repair request failed.",
        },
        { status: repaired.response.status },
      );
    }

    const repairedData = coerceBridgeData(repaired.data);
    const repairedResult = validateReadyModel(repairedData);
    if (repairedResult.ok) {
      return readyResponse(repairedData);
    }

    return NextResponse.json({
      message: `I could not produce validated geometry yet: ${repairedResult.message} I need one simpler constraint pass or a clearer part breakdown.`,
      ready: false,
      model: null,
    });
  }

  return readyResponse(data);
}

async function requestBridge(
  bridgeUrl: string,
  body: {
    user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>;
    transcript: BrainRequest["transcript"];
    referenceImages: BrainRequest["referenceImages"];
    manufacturingProfile: BrainRequest["manufacturingProfile"];
    task?: string;
    instructions?: string;
  },
) {
  const response = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: body.user,
      task: body.task || "3d-model-generator",
      instructions:
        body.instructions ||
        (body.manufacturingProfile?.autoFillSpecifics !== false
          ? "Auto-fill mode is enabled. Do not ask user follow-up questions. Generate production-quality geometry from available context, infer conservative printable defaults for missing values, list assumptions, and return ready:true unless unsafe, impossible, or contradictory."
          : "Ask concise questions until purpose, exact dimensions, tolerances, fit interfaces, material, manufacturing method, printer limits, safety constraints, and photo scale references are clear. When ready, return production-quality geometry plus criticalDimensions and validationReport."),
      transcript: body.transcript,
      referenceImages: body.referenceImages,
      manufacturingProfile: body.manufacturingProfile,
    }),
  });

  return {
    response,
    data: await response.json(),
  };
}

async function buildSwarmContext(
  bridgeUrl: string,
  body: {
    user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>;
    transcript: BrainRequest["transcript"];
    referenceImages: BrainRequest["referenceImages"];
    manufacturingProfile: BrainRequest["manufacturingProfile"];
  },
) {
  const specification = await internalPass(bridgeUrl, body, {
    task: "specification-agent",
    prompt:
      "You are the specification agent. Internally extract exact requirements, unknowns, coordinate frames, tolerances, fit interfaces, manufacturing constraints, and acceptance criteria. Do not create geometry. Return concise JSON with message containing the complete spec brief.",
  });

  const calculations = await internalPass(
    bridgeUrl,
    {
      ...body,
      transcript: [
        ...body.transcript,
        { role: "assistant" as const, content: `Specification brief:\n${specification}` },
      ],
    },
    {
      task: "calculation-agent",
      prompt:
        "You are the calculation agent. Internally compute derived dimensions, clearances, wall offsets, coordinate transforms, repeated feature spacing, build-volume fit, print orientation, and risk checks. Show arithmetic in concise JSON message text. Do not create geometry.",
    },
  );

  const artDirection = await internalPass(
    bridgeUrl,
    {
      ...body,
      transcript: [
        ...body.transcript,
        { role: "assistant" as const, content: `Specification brief:\n${specification}` },
        { role: "assistant" as const, content: `Calculation brief:\n${calculations}` },
      ],
    },
    {
      task: "art-manufacturing-agent",
      prompt:
        "You are the art and manufacturability agent. Internally choose form language, surface detail strategy, renderProfile, support-free print strategy, connected-detail strategy, and geometry ops to use. Preserve all dimensions exactly. Return concise JSON message text.",
    },
  );

  return { specification, calculations, artDirection };
}

async function internalPass(
  bridgeUrl: string,
  body: {
    user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>;
    transcript: BrainRequest["transcript"];
    referenceImages: BrainRequest["referenceImages"];
    manufacturingProfile: BrainRequest["manufacturingProfile"];
  },
  stage: { task: string; prompt: string },
) {
  const { response, data } = await requestBridge(bridgeUrl, {
    ...body,
    task: stage.task,
    instructions: [
      stage.prompt,
      "Return only JSON using schema {\"message\":\"string\",\"ready\":false}.",
      "Do not ask user-facing questions in internal passes; list missing critical values as internal blockers.",
    ].join(" "),
  });

  if (!response.ok) {
    return `Internal ${stage.task} failed; continue from user transcript only.`;
  }

  return data.message || data.output_text || data.text || "";
}

function validateReadyModel(data: {
  ready?: boolean;
  model?: unknown;
}): { ok: true } | { ok: false; message: string } {
  if (!data.ready || !data.model) return { ok: true };

  try {
    normalizePrintableSpec(data.model);
    const quality = assessPrintableQuality(data.model);
    if (!quality.productionReady) {
      return {
        ok: false,
        message: quality.reason,
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: `Invalid geometry: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    };
  }

  return { ok: true };
}

function coerceBridgeData(data: {
  message?: string;
  output_text?: string;
  text?: string;
  ready?: boolean;
  model?: unknown;
}) {
  if (data.ready && data.model) return data;

  const candidate = data.message || data.output_text || data.text || "";
  const parsed = parseJsonPayload(candidate);

  if (parsed?.ready && parsed.model) {
    return {
      ...data,
      message:
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : "Model generated. Review render and export STL when ready.",
      ready: true,
      model: parsed.model,
    };
  }

  return data;
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0] || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next extraction.
    }
  }

  return null;
}

function readyResponse(data: {
  message?: string;
  output_text?: string;
  text?: string;
  ready?: boolean;
  model?: unknown;
}) {
  const model = data.ready ? data.model : null;
  const rawMessage = data.message || data.output_text || data.text || "";
  const parsedMessage = parseJsonPayload(rawMessage);

  return NextResponse.json({
    message:
      (parsedMessage?.ready
        ? parsedMessage.message || "Model generated. Review render and export STL when ready."
        : rawMessage) ||
      "I need a little more detail before generating printable geometry.",
    ready: Boolean(model),
    model,
  });
}
