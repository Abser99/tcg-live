import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../config';

export async function uploadImage(localUri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri: localUri, type: 'image/jpeg', name: 'card.jpg' } as any);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'tcg-live/cards');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData },
  );
  if (!res.ok) throw new Error('Image upload failed');
  const json = await res.json();
  return json.secure_url as string;
}
