const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dsjhoj5wt";
const CLOUDINARY_PRESET = "tcg_live";

export async function uploadToCloudinary(
  file: File,
  folder: string,
  resourceType: "image" | "auto" = "image",
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder", folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`,
    { method: "POST", body: form },
  );
  const data = await res.json();
  if (!data.secure_url) {
    const reason = data.error?.message ?? JSON.stringify(data);
    throw new Error(`Error al subir imagen: ${reason}`);
  }
  return data.secure_url as string;
}
