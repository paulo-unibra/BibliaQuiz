import { DRIVE_FOLDER_ID, GOOGLE_API_KEY, hasDriveApi } from '@/constants/config';

export type CatalogItem = { id: string; name: string; updatedAt?: string };

const DRIVE_V3 = 'https://www.googleapis.com/drive/v3';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const canUseDriveApi = () => hasDriveApi();

export async function listFolderFiles(): Promise<CatalogItem[]> {
  if (!hasDriveApi()) throw new Error('Drive API not configured');
  const url = `${DRIVE_V3}/files?q='${encodeURIComponent(
    DRIVE_FOLDER_ID
  )}' in parents and mimeType='application/json' and trashed=false&key=${GOOGLE_API_KEY}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`;
  const data = await getJson<any>(url);
  const files = Array.isArray(data?.files) ? data.files : [];
  return files.map((f: any) => ({ id: String(f.id), name: String(f.name || 'Sem título'), updatedAt: f.modifiedTime ? String(f.modifiedTime) : undefined }));
}

export async function fetchFileJson<T = any>(fileId: string): Promise<T> {
  if (!hasDriveApi()) throw new Error('Drive API not configured');
  // v3 media endpoint with API key
  const url = `${DRIVE_V3}/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
  return getJson<T>(url);
}
