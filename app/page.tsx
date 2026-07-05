import { requireChatGPTUser } from "./chatgpt-auth";
import { ModelGenerator } from "./model-generator";

export default async function Home() {
  const user = await requireChatGPTUser("/");

  return <ModelGenerator displayName={user.displayName} />;
}
