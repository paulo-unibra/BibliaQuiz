import { DRIVE_INDEX_FILE_ID, hasDriveIndex } from '@/constants/config';

export type CatalogItem = {
  id: string;
  name: string;
  updatedAt?: string;
};

export type Pergunta = {
  id: string;
  pergunta: string;
  alternativas: string[];
  respostaCorreta: string;
};

export type Questionnaire = {
  id: string;
  name?: string;
  perguntas: Pergunta[];
};

const fileContentUrl = (fileId: string) => `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
// For public files, also works via: https://drive.google.com/uc?export=download&id=FILE_ID
const publicDownloadUrl = (fileId: string) => `https://drive.google.com/uc?export=download&id=${fileId}`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const canUsePublicDrive = () => hasDriveIndex();

// The index JSON should be publicly shared and look like:
// { items: [{ id: 'FILE_ID', name: 'Título', updatedAt?: 'ISO' }, ...] }
export async function listCatalogFromPublicIndex(): Promise<CatalogItem[]> {
  if (!hasDriveIndex()) throw new Error('INDEX file id not configured');
  try {
    // Prefer uc? URL which generally works with public files
    const url = publicDownloadUrl(DRIVE_INDEX_FILE_ID);
    const data = await fetchJson<any>(url);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((x: any) => ({ id: String(x.id), name: String(x.name || 'Sem título'), updatedAt: x.updatedAt ? String(x.updatedAt) : undefined }));
  } catch {
    // fallback to v3 media URL (requires proper CORS/public access)
    const url = fileContentUrl(DRIVE_INDEX_FILE_ID);
    const data = await fetchJson<any>(url);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((x: any) => ({ id: String(x.id), name: String(x.name || 'Sem título'), updatedAt: x.updatedAt ? String(x.updatedAt) : undefined }));
  }
}

export async function getQuestionnairePublic(fileId: string): Promise<Questionnaire> {
  try {
    const data = await fetchJson<any>(publicDownloadUrl(fileId));
    const perguntas = Array.isArray(data) ? data : data?.perguntas;
    const name = data?.name;
    if (!Array.isArray(perguntas)) throw new Error('Formato inválido');
    return { id: fileId, name, perguntas };
  } catch {
    const data = await fetchJson<any>(fileContentUrl(fileId));
    const perguntas = Array.isArray(data) ? data : data?.perguntas;
    const name = data?.name;
    if (!Array.isArray(perguntas)) throw new Error('Formato inválido');
    return { id: fileId, name, perguntas };
  }
}
