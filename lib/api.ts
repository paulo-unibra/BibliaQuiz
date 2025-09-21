import { API_BASE, hasApi } from '@/constants/config';

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
  name: string;
  perguntas: Pergunta[];
};

const get = async <T>(path: string): Promise<T> => {
  if (!hasApi()) throw new Error('API não configurada');
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return (await res.json()) as T;
};

export const listCatalog = () => get<CatalogItem[]>(`/catalog`);
export const getQuestionnaire = (id: string) => get<Questionnaire>(`/questionnaires/${id}`);
