import { fetchFileJson, listFolderFiles } from '@/lib/driveApi';
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
  const containerHeightRef = useRef(0);
  const aguaAltura = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const lockedRef = useRef(false);

  const perguntaAtual = useMemo(() => perguntas[indice], [indice, perguntas]);

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

  // Catálogo: carrega quando nesse estágio
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (stage !== 'catalog') return;
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const items = await listFolderFiles();
        console.log('Catalog items:', items);
        if (!cancelled) setCatalog(items);
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

  const abrirQuestionario = async (id: string, fallbackName?: string) => {
    try {
      const data: any = await fetchFileJson(id);
      const arr = Array.isArray(data) ? data : data?.perguntas || data?.questions;
      setQuestionarioNome(
        typeof data?.name === 'string' && data.name.trim().length > 0
          ? String(data.name)
          : (fallbackName && fallbackName.trim().length > 0 ? fallbackName : 'Bible Quiz')
      );
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container} onLayout={onLayoutContainer}>
        <Animated.View pointerEvents="none" style={[styles.agua, { height: aguaAltura }]} />

        {stage === 'catalog' && (
          <ScrollView contentContainerStyle={styles.uploadWrapper}>
            <Text style={styles.titulo}>Catálogo de Questionários</Text>
            {catalogLoading && <Text style={styles.infoTexto}>Carregando…</Text>}
            {catalogError && <Text style={styles.errorText}>{catalogError}</Text>}
            {!catalogLoading && !catalogError && (
              <View style={{ gap: 8 }}>
                {(catalog || []).map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => abrirQuestionario(item.id, toDisplayName(item.name))}
                    style={({ pressed }) => [styles.cardPergunta, pressed && styles.altBotaoPressed]}
                  >
                    <Text style={styles.perguntaTexto}>{toDisplayName(item.name)}</Text>
                    {(item as any).updatedAt ? (
                      <Text style={styles.infoTexto}>Atualizado em: {new Date((item as any).updatedAt as any).toLocaleString()}</Text>
                    ) : null}
                  </Pressable>
                ))}
                {(catalog || []).length === 0 && (
                  <Text style={styles.infoTexto}>Nenhum questionário encontrado.</Text>
                )}
              </View>
            )}
            <View style={{ height: 12 }} />
            <Pressable onPress={() => setStage('catalog')} style={styles.botaoSecundario} android_ripple={{ color: '#e6eef5' }}>
              <Text style={styles.botaoSecundarioTexto}>Recarregar</Text>
            </Pressable>
          </ScrollView>
        )}

        {stage === 'start' && (
          <View style={styles.centerContent}>
            <Text style={styles.titulo}>{questionarioNome}</Text>
            <Text style={[styles.infoTexto, { marginBottom: 8 }]}>Perguntas carregadas: {basePerguntas.length}</Text>
            <Pressable
              onPress={iniciarQuiz}
              style={[styles.botaoGrande, basePerguntas.length === 0 && styles.botaoDesabilitado]}
              disabled={basePerguntas.length === 0}
              android_ripple={{ color: '#e0f2ff' }}
            >
              <Text style={styles.botaoGrandeTexto}>Iniciar</Text>
            </Pressable>
            <Pressable onPress={() => setStage('catalog')} style={{ marginTop: 12, padding: 8 }}>
              <Text style={{ color: '#0b4870', textDecorationLine: 'underline' }}>Voltar ao catálogo</Text>
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
                  android_ripple={{ color: '#d7eefe' }}
                >
                  <Text style={styles.altTexto}>{alt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {stage === 'result' && (
          <View style={styles.centerContent}>
            <Text style={styles.titulo}>Resultado</Text>
            <Text style={styles.resultLinha}>Acertos: {acertos}</Text>
            <Text style={styles.resultLinha}>Erros: {erros}</Text>
            <Pressable onPress={reiniciar} style={[styles.botaoGrande, { marginTop: 24 }]} android_ripple={{ color: '#e0f2ff' }}>
              <Text style={styles.botaoGrandeTexto}>Reiniciar</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6fbff' },
  container: {
    flex: 1,
    backgroundColor: '#f6fbff',
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  agua: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#bde7ff',
  },
  uploadWrapper: {
    padding: 16,
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
    color: '#0b4870',
    textAlign: 'center',
  },
  infoTexto: {
    color: '#0b4870',
    fontSize: 14,
  },
  bullet: {
    color: '#0b4870',
    fontSize: 14,
    marginLeft: 8,
    marginTop: 2,
  },
  codeBox: {
    backgroundColor: '#0b4870',
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
    backgroundColor: '#3ba9ff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    elevation: 2,
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
    backgroundColor: '#e9f3fb',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9ecfb',
  },
  botaoSecundarioTexto: {
    color: '#0b4870',
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
    borderColor: '#d9ecfb',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    color: '#0b4870',
  },
  errorText: {
    color: '#b10a0a',
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
  pillAcerto: { backgroundColor: '#d9fbe5' },
  pillErro: { backgroundColor: '#ffe1e1' },
  pillTexto: { color: '#053b63', fontWeight: '700' },
  cardPergunta: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  perguntaTexto: {
    fontSize: 20,
    fontWeight: '700',
    color: '#073e6b',
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
    borderColor: '#d9ecfb',
  },
  altBotaoPressed: {
    backgroundColor: '#eef7ff',
  },
  altTexto: {
    fontSize: 18,
    color: '#094a7a',
    fontWeight: '600',
    textAlign: 'center',
  },
  resultLinha: {
    fontSize: 18,
    color: '#0b4870',
    marginTop: 6,
  },
});
