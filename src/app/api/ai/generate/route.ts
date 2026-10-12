import { authed, body } from "@/server/http";
import { generateCards, type GenerateInput } from "@/server/services/ai";

export const maxDuration = 60;
export const POST = authed(async (req, { uid }) => generateCards(uid, await body<GenerateInput>(req)));
