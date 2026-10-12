import { authed, HttpError } from "@/server/http";
import { storeMedia } from "@/server/media";

export const POST = authed(async (req, { uid }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "file_required");
  const name = (form.get("filename") as string) || (file as File).name || "file";
  return storeMedia(uid, { name, type: file.type, bytes: await file.arrayBuffer() });
});
