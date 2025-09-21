import { fetchFileJson, listFolderFiles } from '@/lib/driveApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    LayoutChangeEvent,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type Pergunta = {
  id: string;
  pergunta: string;
  alternativas: string[];
  respostaCorreta: string;
};

type Stage = 'catalog' | 'start' | 'quiz' | 'result';

// Util: embaralhar array (Fisher-Yates)
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Remove sufixo .json (case-insensitive) para exibição
const toDisplayName = (name: string) => name.replace(/\.json$/i, '');

// Prepara perguntas embaralhando a ordem e também as alternativas,
// balanceando a posição da resposta correta entre A/B/C/D para não concentrar.
function prepareQuestions(base: Pergunta[]): Pergunta[] {
  const qs = shuffle(base);
  if (qs.length === 0) return qs;
  const maxOptions = Math.max(...qs.map(q => q.alternativas?.length || 0)) || 4;

  // Cria sequência de posições alvo (0..maxOptions-1) repetida e embaralhada
  const seq: number[] = [];
  for (let i = 0; i < qs.length; i++) seq.push(i % maxOptions);
  const desiredPositions = shuffle(seq);

  return qs.map((q, i) => {
    const opts = shuffle(q.alternativas || []);
    const L = Math.max(opts.length, 1);
    const desired = desiredPositions[i] % L;
    const correctIdx = opts.findIndex(a => a === q.respostaCorreta);
    if (correctIdx >= 0 && correctIdx !== desired) {
      const tmp = opts[desired];
      opts[desired] = opts[correctIdx];
      opts[correctIdx] = tmp;
    }
    return { ...q, alternativas: opts };
  });
}

export default function HomeScreen() {
  const [stage, setStage] = useState<Stage>('catalog');
  const [indice, setIndice] = useState(0);
  const [acertos, setAcertos] = useState(0);
  const [erros, setErros] = useState(0);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [basePerguntas, setBasePerguntas] = useState<Pergunta[]>([]);
  const [questionarioNome, setQuestionarioNome] = useState<string>('Bible Quiz');
  const [catalog, setCatalog] = useState<{ id: string; name: string; updatedAt?: string }[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastScores, setLastScores] = useState<Record<string, number>>({});
  const [lastDates, setLastDates] = useState<Record<string, number>>({});
  const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
  const containerHeightRef = useRef(0);
  const aguaAltura = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const lockedRef = useRef(false);

  const perguntaAtual = useMemo(() => perguntas[indice], [indice, perguntas]);

  // Nota (0 a 10) e aprovação no resultado
  const totalPerguntas = useMemo(
    () => (basePerguntas.length > 0 ? basePerguntas.length : perguntas.length),
    [basePerguntas.length, perguntas.length]
  );
  const nota = useMemo(
    () => (totalPerguntas > 0 ? (acertos / totalPerguntas) * 10 : 0),
    [acertos, totalPerguntas]
  );
  const aprovado = nota >= 6;

  // N/A: upload JSON removido

  const startTimer = useCallback(() => {
    const H = containerHeightRef.current;
    if (!H) return;
    aguaAltura.setValue(H);
    animationRef.current?.stop();
    animationRef.current = Animated.timing(aguaAltura, {
      toValue: 0,
      duration: 10000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    lockedRef.current = false;
    animationRef.current.start(({ finished }) => {
      if (finished) {
        if (stage === 'quiz' && !lockedRef.current) {
          lockedRef.current = true;
          setErros((e) => e + 1);
          setIndice((i) => {
            const proximo = i + 1;
            if (proximo >= perguntas.length) {
              setStage('result');
              return i;
            }
            return proximo;
          });
        }
      }
    });
  }, [aguaAltura, stage, perguntas.length]);

  const pararTimer = useCallback(() => {
    animationRef.current?.stop();
  }, []);

  const avancarPergunta = useCallback(() => {
    setIndice((i) => {
      const proximo = i + 1;
      if (proximo >= perguntas.length) {
        setStage('result');
        return i;
      }
      return proximo;
    });
  }, [perguntas.length]);

  useEffect(() => {
    if (stage === 'quiz' && containerHeightRef.current > 0) {
      startTimer();
    }
    return () => {
      if (stage !== 'quiz') animationRef.current?.stop();
    };
  }, [indice, stage, startTimer]);

  const onLayoutContainer = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h && h !== containerHeightRef.current) {
      containerHeightRef.current = h;
      if (stage === 'quiz') {
        startTimer();
      } else {
        aguaAltura.setValue(h);
      }
    }
  };

  const selecionarAlternativa = (alt: string) => {
    if (lockedRef.current || stage !== 'quiz') return;
    lockedRef.current = true;
    pararTimer();
    const correta = perguntaAtual?.respostaCorreta === alt;
    if (correta) setAcertos((a) => a + 1);
    else setErros((e) => e + 1);
    setTimeout(() => {
      avancarPergunta();
    }, 200);
  };

  const iniciarQuiz = () => {
    setAcertos(0);
    setErros(0);
    setIndice(0);
    lockedRef.current = false;
    setPerguntas(prepareQuestions(basePerguntas));
    setStage('quiz');
  };

  const reiniciar = () => {
    animationRef.current?.stop();
    setStage('catalog');
    setAcertos(0);
    setErros(0);
    setIndice(0);
  };

  const refazerMesmoQuiz = () => {
    animationRef.current?.stop();
    setAcertos(0);
    setErros(0);
    setIndice(0);
    lockedRef.current = false;
    setPerguntas(prepareQuestions(basePerguntas));
    setStage('quiz');
  };

  // Catálogo: carrega quando nesse estágio
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (stage !== 'catalog') return;
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const items = await listFolderFiles();
        if (!cancelled) setCatalog(items);
        // Carrega notas salvas para os itens
        try {
          const scoreKeys = items.map((it) => `@biblequiz:lastScore:${it.id}`);
          const dateKeys = items.map((it) => `@biblequiz:lastDate:${it.id}`);
          const pairs = await AsyncStorage.multiGet([...scoreKeys, ...dateKeys]);
          if (!cancelled) {
            const map: Record<string, number> = {};
            const dateMap: Record<string, number> = {};
            pairs.forEach(([key, value]: [string, string | null]) => {
              if (key && value != null) {
                const id = key.substring(key.lastIndexOf(':') + 1);
                if (key.includes(':lastScore:')) {
                  const num = Number(value);
                  if (!Number.isNaN(num)) map[id] = num;
                } else if (key.includes(':lastDate:')) {
                  const ts = Number(value);
                  if (!Number.isNaN(ts)) dateMap[id] = ts;
                }
              }
            });
            setLastScores(map);
            setLastDates(dateMap);
          }
        } catch {}
      } catch (e: any) {
        if (!cancelled) setCatalogError(e?.message || 'Falha ao carregar catálogo');
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return catalog || [];
    return (catalog || []).filter((c) => toDisplayName(c.name).toLowerCase().includes(term));
  }, [catalog, search]);

  const recarregarCatalogo = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const items = await listFolderFiles();
      setCatalog(items);
      // Recarrega notas
      try {
        const scoreKeys = items.map((it) => `@biblequiz:lastScore:${it.id}`);
        const dateKeys = items.map((it) => `@biblequiz:lastDate:${it.id}`);
        const pairs = await AsyncStorage.multiGet([...scoreKeys, ...dateKeys]);
        const map: Record<string, number> = {};
        const dateMap: Record<string, number> = {};
        pairs.forEach(([key, value]: [string, string | null]) => {
          if (key && value != null) {
            const id = key.substring(key.lastIndexOf(':') + 1);
            if (key.includes(':lastScore:')) {
              const num = Number(value);
              if (!Number.isNaN(num)) map[id] = num;
            } else if (key.includes(':lastDate:')) {
              const ts = Number(value);
              if (!Number.isNaN(ts)) dateMap[id] = ts;
            }
          }
        });
        setLastScores(map);
        setLastDates(dateMap);
      } catch {}
    } catch (e: any) {
      setCatalogError(e?.message || 'Falha ao carregar catálogo');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const abrirQuestionario = async (id: string, fallbackName?: string) => {
    try {
      const data: any = await fetchFileJson(id);
      const arr = Array.isArray(data) ? data : data?.perguntas || data?.questions;
      setQuestionarioNome(
        typeof data?.name === 'string' && data.name.trim().length > 0
          ? String(data.name)
          : (fallbackName && fallbackName.trim().length > 0 ? fallbackName : 'Bible Quiz')
      );
      setCurrentQuizId(id);
      setBasePerguntas(Array.isArray(arr) ? arr : []);
      setPerguntas([]);
      setIndice(0);
      setAcertos(0);
      setErros(0);
      setStage('start');
    } catch (e: any) {
      setCatalogError(e?.message || 'Não foi possível abrir o questionário');
    }
  };

  // Ao chegar no resultado, persiste a última nota do questionário atual
  useEffect(() => {
    const save = async () => {
      if (stage !== 'result') return;
      if (!currentQuizId) return;
      const valor = Number(nota.toFixed(1));
      try {
        await AsyncStorage.setItem(`@biblequiz:lastScore:${currentQuizId}`, String(valor));
        const now = Date.now();
        await AsyncStorage.setItem(`@biblequiz:lastDate:${currentQuizId}`, String(now));
        setLastScores((prev) => ({ ...prev, [currentQuizId]: valor }));
        setLastDates((prev) => ({ ...prev, [currentQuizId]: now }));
      } catch {}
    };
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return (
    <SafeAreaView style={[
      styles.safe,
      stage === 'result' && (aprovado ? styles.bgAprovado : styles.bgReprovado),
    ]}>
      <View
        style={[
          styles.container,
          stage === 'result' && (aprovado ? styles.bgAprovado : styles.bgReprovado),
        ]}
        onLayout={onLayoutContainer}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.agua, { height: stage === 'quiz' ? aguaAltura : 0 }]}
        />

        {stage === 'catalog' && (
          <>
          <ScrollView contentContainerStyle={[styles.uploadWrapper, { paddingBottom: 90 }]}> 
            <Text style={styles.titulo}>Catálogo de Questionários</Text>
            <View style={styles.searchWrapper}>
              <TextInput
                placeholder="Buscar questionário..."
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>
            {catalogLoading && <Text style={styles.infoTexto}>Carregando…</Text>}
            {catalogError && <Text style={styles.errorText}>{catalogError}</Text>}
            {!catalogLoading && !catalogError && (
              <View style={{ gap: 8 }}>
                {filteredCatalog.map((item) => {
                  const score = lastScores[item.id];
                  const lastTs = lastDates[item.id];
                  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
                  const showWeekMsg = typeof lastTs === 'number' && Date.now() - lastTs > ONE_WEEK;
                  const cardTone = typeof score === 'number' ? (score < 6 ? styles.cardFalha : styles.cardAprovado) : null;
                  return (
                  <Pressable
                    key={item.id}
                    onPress={() => abrirQuestionario(item.id, toDisplayName(item.name))}
                    style={({ pressed }) => [styles.cardPergunta, cardTone, pressed && styles.altBotaoPressed]}
                  >
                    <Text style={styles.perguntaTexto}>{toDisplayName(item.name)}</Text>
                    {(item as any).updatedAt ? (
                      <Text style={styles.infoTexto}>Atualizado em: {new Date((item as any).updatedAt as any).toLocaleString()}</Text>
                    ) : null}
                    <Text style={styles.infoTexto}>
                      {score != null ? `Última nota: ${score.toFixed(1)} / 10` : 'Sem nota ainda'}
                    </Text>
                    {lastTs != null && (
                      <Text style={styles.infoTexto}>Última vez: {new Date(lastTs).toLocaleDateString()}</Text>
                    )}
                    {showWeekMsg && (
                      <Text style={styles.dicaTexto}>💡 Já faz mais de 1 semana que você fez esse questionário. Vamos revisar?</Text>
                    )}
                  </Pressable>
                );})}
                {filteredCatalog.length === 0 && (
                  <Text style={styles.infoTexto}>Nenhum questionário encontrado.</Text>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.bottomBar}>
            <Pressable onPress={recarregarCatalogo} style={styles.botaoBottom} android_ripple={{ color: '#e2e8f0' }}>
              <Text style={styles.botaoBottomTexto}>Recarregar</Text>
            </Pressable>
          </View>
          </>
        )}

        {stage === 'start' && (
          <View style={styles.centerContent}>
            <Text style={styles.titulo}>{questionarioNome}</Text>
            <Text style={[styles.infoTexto, { marginBottom: 8 }]}>Perguntas carregadas: {basePerguntas.length}</Text>
            <Pressable
              onPress={iniciarQuiz}
              style={[styles.botaoGrande, basePerguntas.length === 0 && styles.botaoDesabilitado]}
              disabled={basePerguntas.length === 0}
              android_ripple={{ color: '#dbeafe' }}
            >
              <Text style={styles.botaoGrandeTexto}>Iniciar</Text>
            </Pressable>
            <Pressable onPress={() => setStage('catalog')} style={{ marginTop: 12, padding: 8 }}>
              <Text style={{ color: '#2563eb', textDecorationLine: 'underline' }}>Voltar ao catálogo</Text>
            </Pressable>
          </View>
        )}

        {stage === 'quiz' && (
          <View style={styles.quizWrapper}>
            <View style={styles.contadores}>
              <View style={[styles.pill, styles.pillAcerto]}>
                <Text style={styles.pillTexto}>Acertos: {acertos}</Text>
              </View>
              <View style={[styles.pill, styles.pillErro]}>
                <Text style={styles.pillTexto}>Erros: {erros}</Text>
              </View>
            </View>

            <View style={styles.cardPergunta}>
              <Text style={styles.perguntaTexto}>{perguntaAtual?.pergunta}</Text>
            </View>

            <View style={styles.alternativas}>
              {perguntaAtual?.alternativas.map((alt) => (
                <Pressable
                  key={alt}
                  style={({ pressed }) => [styles.altBotao, pressed && styles.altBotaoPressed]}
                  onPress={() => selecionarAlternativa(alt)}
                  android_ripple={{ color: '#dbeafe' }}
                >
                  <Text style={styles.altTexto}>{alt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {stage === 'result' && (
          <View style={styles.centerContent}>
            <Text style={styles.emoji}>{aprovado ? '😀' : '😞'}</Text>
            <Text style={styles.titulo}>{aprovado ? 'Parabéns!' : 'Continue tentando'}</Text>
            <Text style={styles.resultLinha}>Nota: {nota.toFixed(1)} / 10</Text>
            <Text style={styles.resultLinha}>Acertos: {acertos}</Text>
            <Text style={styles.resultLinha}>Erros: {erros}</Text>
            <View style={{ gap: 12, marginTop: 24, width: '100%', paddingHorizontal: 16 }}>
              <Pressable onPress={refazerMesmoQuiz} style={styles.botaoGrande} android_ripple={{ color: '#dbeafe' }}>
                <Text style={styles.botaoGrandeTexto}>Refazer</Text>
              </Pressable>
              <Pressable onPress={reiniciar} style={styles.botaoSecundario} android_ripple={{ color: '#e2e8f0' }}>
                <Text style={styles.botaoSecundarioTexto}>Voltar para o início</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  bgAprovado: { backgroundColor: '#ecfdf5' }, // verde claro
  bgReprovado: { backgroundColor: '#fef2f2' }, // vermelho claro
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  agua: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#bfdbfe',
  },
  uploadWrapper: {
    padding: 16,
  },
  searchWrapper: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
    fontSize: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 24,
    color: '#0f172a',
    textAlign: 'center',
  },
  infoTexto: {
    color: '#334155',
    fontSize: 14,
  },
  bullet: {
    color: '#334155',
    fontSize: 14,
    marginLeft: 8,
    marginTop: 2,
  },
  codeBox: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  codeText: {
    color: 'white',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
  botaoGrande: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  botaoDesabilitado: {
    opacity: 0.5,
  },
  botaoGrandeTexto: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  botaoSecundario: {
    backgroundColor: '#eef2f7',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  botaoSecundarioTexto: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 12,
  },
  textArea: {
    marginTop: 8,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    minHeight: 180,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    color: '#0f172a',
  },
  errorText: {
    color: '#991b1b',
    marginTop: 6,
  },
  quizWrapper: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  contadores: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
  },
  pillAcerto: { backgroundColor: '#dcfce7' },
  pillErro: { backgroundColor: '#fee2e2' },
  pillTexto: { color: '#0f172a', fontWeight: '700' },
  cardPergunta: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardFalha: {
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
  },
  cardAprovado: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  perguntaTexto: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  alternativas: {
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  altBotao: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  altBotaoPressed: {
    backgroundColor: '#eff6ff',
  },
  altTexto: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '600',
    textAlign: 'center',
  },
  resultLinha: {
    fontSize: 18,
    color: '#334155',
    marginTop: 6,
  },
  dicaTexto: {
    color: '#0f172a',
    marginTop: 6,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  botaoBottom: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoBottomTexto: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
