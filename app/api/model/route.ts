import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createPrintableStl,
  normalizePrintableSpec,
} from "../../../src/printable-model.mjs";

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with ChatGPT." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const model = normalizePrintableSpec(body.model);
    const stl = createPrintableStl(model);

    return new NextResponse(stl, {
      headers: {
        "Content-Disposition": `attachment; filename="${model.name}.stl"`,
        "Content-Type": "model/stl; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Codex returned invalid geometry: ${stripTrailingPeriod(error.message)}. Regenerate using supported primitives, without polyhedron.`
            : "Model generation failed.",
      },
      { status: 422 },
    );
  }
}

function stripTrailingPeriod(message: string) {
  return message.replace(/\.+$/, "");
}
