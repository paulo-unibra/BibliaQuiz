import { fetchFileJson, listFolderFiles } from '@/lib/driveApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Pergunta = {
  id: string;
  pergunta: string;
  alternativas: string[];
  respostaCorreta: string;
  nivel?: 'facil' | 'medio' | 'dificil';
};

type Stage = 'catalog' | 'loading' | 'start' | 'quiz' | 'result' | 'dashboard';

const DURATION_BY_LEVEL = {
  facil: 30000, 
  medio: 20000, 
  dificil: 15000,
};

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

// Função para calcular a cor da água baseada no tempo restante
const getWaterColor = (tempoRestante: number): string => {
  if (tempoRestante > 30) {
    return '#bfdbfe'; // Azul normal
  }
  
  // Nos últimos 30 segundos, adiciona "temperatura" na cor azul muito gradualmente
  const progress = Math.min(1, (30 - tempoRestante) / 30); // 0 a 1 ao longo de 30 segundos
  
  // Transição ultra-suave usando curva exponencial para mudança mais gradual
  const smoothProgress = Math.pow(progress, 2.2); // Curva ainda mais suave que acelera só no final
  
  // Cores base do azul original
  const baseRed = 191;
  const baseGreen = 219;  
  const baseBlue = 254;
  
  // Mudanças muito sutis - praticamente imperceptível nos primeiros 20s
  const r = Math.round(baseRed + (35 * smoothProgress)); // Vermelho cresce devagar
  const g = Math.round(baseGreen - (85 * smoothProgress)); // Verde diminui devagar
  const b = Math.round(baseBlue - (120 * smoothProgress)); // Azul diminui devagar
  
  // Garante valores RGB válidos
  const red = Math.min(255, Math.max(0, r));
  const green = Math.min(255, Math.max(0, g));
  const blue = Math.min(255, Math.max(0, b));
  
  return `rgb(${red}, ${green}, ${blue})`;
};

// Classifica o nível da questão baseado no tamanho do texto
function classificarNivel(pergunta: string): 'facil' | 'medio' | 'dificil' {
  const tamanho = pergunta.trim().length;
  if (tamanho > 150) return 'facil';    // Textos longos = mais fácil, mais tempo
  if (tamanho > 80) return 'medio';     // Textos médios = tempo médio
  return 'dificil';                     // Textos curtos = mais difícil, menos tempo
}

// Prepara perguntas embaralhando a ordem e também as alternativas,
// balanceando a posição da resposta correta entre A/B/C/D para não concentrar.
// Divide as questões em 3 blocos iguais: fácil -> médio -> difícil
function prepareQuestions(base: Pergunta[]): Pergunta[] {
  if (base.length === 0) return base;
  
  // Classifica todas as questões por nível baseado no tamanho do texto
  const questoesComNivel = base.map(q => ({
    ...q,
    nivel: classificarNivel(q.pergunta)
  }));
  
  // Embaralha todas as questões primeiro
  const questoesEmbaralhadas = shuffle(questoesComNivel);
  
  // Calcula quantas questões por bloco (dividindo igualmente)
  const total = questoesEmbaralhadas.length;
  const questoesPorBloco = Math.floor(total / 3);
  const resto = total % 3;
  
  // Distribui as questões em 3 blocos de tamanhos iguais (ou quase iguais)
  const blocoFacil: Pergunta[] = [];
  const blocoMedio: Pergunta[] = [];
  const blocoDificil: Pergunta[] = [];
  
  questoesEmbaralhadas.forEach((q, index) => {
    if (index < questoesPorBloco + (resto > 0 ? 1 : 0)) {
      blocoFacil.push({ ...q, nivel: 'facil' });
    } else if (index < questoesPorBloco * 2 + (resto > 1 ? 1 : 0) + (resto > 0 ? 1 : 0)) {
      blocoMedio.push({ ...q, nivel: 'medio' });
    } else {
      blocoDificil.push({ ...q, nivel: 'dificil' });
    }
  });
  
  // Organiza na ordem: fácil -> médio -> difícil
  const qs = [...blocoFacil, ...blocoMedio, ...blocoDificil];
  
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
  const insets = useSafeAreaInsets();
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number>(20);
  const loadingTokenRef = useRef(0);

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
    if (!H || !perguntaAtual) return;
    
    const nivel = perguntaAtual.nivel || 'medio';
    const duration = DURATION_BY_LEVEL[nivel];
    
    aguaAltura.setValue(H);
    animationRef.current?.stop();
    animationRef.current = Animated.timing(aguaAltura, {
      toValue: 0,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    lockedRef.current = false;
    // inicia contador regressivo em segundos
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTempoRestante(duration / 1000);
    const end = Date.now() + duration;
    intervalRef.current = setInterval(() => {
      const leftMs = end - Date.now();
      const leftS = Math.ceil(leftMs / 1000);
      setTempoRestante(leftS > 0 ? leftS : 0);
      if (leftMs <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 250);
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
        // garante zerar o contador quando terminar
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setTempoRestante(0);
      }
    });
  }, [aguaAltura, stage, perguntas.length, perguntaAtual]);

  const pararTimer = useCallback(() => {
    animationRef.current?.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
      if (stage !== 'quiz') {
        animationRef.current?.stop();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };
  }, [indice, stage, startTimer]);

  const onLayoutContainer = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h && h !== containerHeightRef.current) {
      containerHeightRef.current = h;
      if (stage === 'quiz') {
        startTimer();
      } else {
        aguaAltura.setValue(0);
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

  // Back (Android): voltar para a tela anterior em vez de sair do app
  const handleHardwareBack = useCallback(() => {
    if (stage === 'catalog') return false; // deixa o SO fechar o app
    if (stage === 'loading') {
      // cancela abertura e volta ao catálogo
      loadingTokenRef.current += 1;
      setStage('catalog');
      return true;
    }
    if (stage === 'dashboard') {
      setStage('catalog');
      return true;
    }
    if (stage === 'start') {
      setStage('catalog');
      return true;
    }
    if (stage === 'quiz') {
      animationRef.current?.stop();
      lockedRef.current = false;
      setIndice(0);
      setAcertos(0);
      setErros(0);
      setStage('start');
      return true;
    }
    if (stage === 'result') {
      setStage('start');
      return true;
    }
    return false;
  }, [stage]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [handleHardwareBack]);

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

  // Estatísticas para o Dashboard
  const {
    totalQuizzes,
    attemptedCount,
    overallAvgAll,
    overallAvgAttempted,
    passRate,
    bestScore,
    worstScore,
    barsData,
    histoBins,
  } = useMemo<{
    totalQuizzes: number;
    attemptedCount: number;
    overallAvgAll: number;
    overallAvgAttempted: number;
    passRate: number;
    bestScore: number | null;
    worstScore: number | null;
    barsData: { id: string; name: string; score: number | null }[];
    histoBins: number[];
  }>(() => {
    const items = catalog || [];
    const total = items.length;
    const scoresEntries = Object.entries(lastScores);
    const attempted = scoresEntries.length;
    let sumAll = 0;
    let sumAttempted = 0;
    let maxScore: number | null = null;
    let minScore: number | null = null;
    let approved = 0;
    const mapScores: Record<string, number> = lastScores;

    // Soma considerando todos os questionários do catálogo (faltantes contam como 0)
    items.forEach((it) => {
      const s = mapScores[it.id];
      if (typeof s === 'number') {
        sumAll += s;
      } else {
        sumAll += 0;
      }
    });

    // Soma apenas dos respondidos
    scoresEntries.forEach(([, s]) => {
      if (typeof s === 'number') {
        sumAttempted += s;
        if (maxScore == null || s > maxScore) maxScore = s;
        if (minScore == null || s < minScore) minScore = s;
        if (s >= 6) approved += 1;
      }
    });

    const overallAll = total > 0 ? sumAll / total : 0;
    const overallAtt = attempted > 0 ? sumAttempted / attempted : 0;
    const pass = attempted > 0 ? (approved / attempted) * 100 : 0;

    // Dados para gráfico de barras por questionário (última nota)
    const bars = items.map((it) => {
      const s = mapScores[it.id];
      return {
        id: it.id,
        name: toDisplayName(it.name),
        score: typeof s === 'number' ? s : null,
      };
    });

    // Histograma simples: faixas 0-2, 2-4, 4-6, 6-8, 8-10
    const bins = [0, 0, 0, 0, 0];
    bars.forEach((b) => {
      if (b.score == null) return;
      const s = b.score;
      let idx = 0;
      if (s < 2) idx = 0;
      else if (s < 4) idx = 1;
      else if (s < 6) idx = 2;
      else if (s < 8) idx = 3;
      else idx = 4;
      bins[idx] += 1;
    });

    return {
      totalQuizzes: total,
      attemptedCount: attempted,
      overallAvgAll: overallAll,
      overallAvgAttempted: overallAtt,
      passRate: pass,
      bestScore: maxScore,
      worstScore: minScore,
      barsData: bars,
      histoBins: bins,
    };
  }, [catalog, lastScores]);

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
    // entra em tela de loading e cria um token para permitir cancelamento
    loadingTokenRef.current += 1;
    const token = loadingTokenRef.current;
    setStage('loading');
    try {
      const data: any = await fetchFileJson(id);
      if (token !== loadingTokenRef.current) return; // cancelado
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
      if (token !== loadingTokenRef.current) return; // cancelado
      setCatalogError(e?.message || 'Não foi possível abrir o questionário');
      setStage('catalog');
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
          style={[
            styles.agua, 
            { 
              height: stage === 'quiz' ? aguaAltura : 0,
              backgroundColor: stage === 'quiz' ? getWaterColor(tempoRestante) : '#bfdbfe'
            }
          ]}
        />

        {stage === 'catalog' && (
          <>
          <ScrollView contentContainerStyle={[styles.uploadWrapper, { paddingBottom: 90 + insets.bottom }]}> 
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
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom - 20 }]}> 
            <View style={styles.bottomRow}>
              <Pressable onPress={recarregarCatalogo} style={[styles.botaoBottom, { flex: 1 }]} android_ripple={{ color: '#e2e8f0' }}>
                <Text style={styles.botaoBottomTexto}>Recarregar</Text>
              </Pressable>
              <Pressable onPress={() => setStage('dashboard')} style={[styles.botaoBottomSec, { flex: 1 }]} android_ripple={{ color: '#e2e8f0' }}>
                <Text style={styles.botaoBottomSecTexto}>Dashboard</Text>
              </Pressable>
            </View>
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

        {stage === 'loading' && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={[styles.infoTexto, { marginTop: 12 }]}>Carregando questionário…</Text>
            <Pressable onPress={() => setStage('catalog')} style={{ marginTop: 16, padding: 8 }}>
              <Text style={{ color: '#2563eb', textDecorationLine: 'underline' }}>Cancelar</Text>
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

            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              {perguntaAtual?.nivel && (
                <View style={[
                  styles.pill, 
                  perguntaAtual.nivel === 'facil' && styles.pillFacil,
                  perguntaAtual.nivel === 'medio' && styles.pillMedio,
                  perguntaAtual.nivel === 'dificil' && styles.pillDificil
                ]}>
                  <Text style={styles.pillTexto}>
                    {perguntaAtual.nivel === 'facil' && '🟢 Fácil'}
                    {perguntaAtual.nivel === 'medio' && '🟡 Médio'}
                    {perguntaAtual.nivel === 'dificil' && '🔴 Difícil'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardPerguntaContainer}>
              <View style={[styles.timerCircle, styles.timerCircleFixo]}>
                <Text style={styles.timerCircleTexto}>{tempoRestante}</Text>
              </View>
              <View style={styles.cardPergunta}>
                <Text style={styles.perguntaTexto}>{perguntaAtual?.pergunta}</Text>
              </View>
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <View style={[styles.pill, styles.pillQuestao]}>
                  <Text style={styles.pillTexto}>Questão {indice + 1} de {perguntas.length}</Text>
                </View>
              </View>
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

        {stage === 'dashboard' && (
          <ScrollView contentContainerStyle={[styles.uploadWrapper, { paddingBottom: 90 + insets.bottom }]}> 
            <Text style={styles.titulo}>Dashboard</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Questionários</Text>
                <Text style={styles.summaryValue}>{totalQuizzes}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Respondidos</Text>
                <Text style={styles.summaryValue}>{attemptedCount}</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Média geral</Text>
                <Text style={styles.summaryValue}>{overallAvgAll.toFixed(1)}</Text>
                <Text style={styles.summaryHint}>Soma das últimas notas / total de questionários</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Média (respondidos)</Text>
                <Text style={styles.summaryValue}>{overallAvgAttempted.toFixed(1)}</Text>
                <Text style={styles.summaryHint}>Apenas questionários com nota</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Aprovação</Text>
                <Text style={styles.summaryValue}>{passRate.toFixed(0)}%</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Melhor / Pior</Text>
                <Text style={styles.summaryValue}>
                  {bestScore != null ? bestScore.toFixed(1) : '--'} / {worstScore != null ? worstScore.toFixed(1) : '--'}
                </Text>
              </View>
            </View>

            <Text style={[styles.titulo, { fontSize: 24, marginTop: 8 }]}>Média por questionário</Text>
            <View style={{ gap: 10 }}>
              {barsData.map((b) => {
                const pct = b.score != null ? Math.max(0, Math.min(100, (b.score / 10) * 100)) : 0;
                const fillColor = b.score == null ? '#cbd5e1' : b.score >= 6 ? '#22c55e' : '#ef4444';
                return (
                  <View key={b.id} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
                    </View>
                    <Text style={styles.barValue}>{b.score != null ? b.score.toFixed(1) : '--'}</Text>
                  </View>
                );
              })}
              {barsData.length === 0 && (
                <Text style={styles.infoTexto}>Sem dados para exibir.</Text>
              )}
            </View>

            <Text style={[styles.titulo, { fontSize: 24, marginTop: 16 }]}>Distribuição de notas</Text>
            <View style={styles.histoWrap}>
              {histoBins.map((count, idx) => {
                const max = Math.max(1, ...histoBins);
                const h = (count / max) * 100;
                const label = idx === 0 ? '0-2' : idx === 1 ? '2-4' : idx === 2 ? '4-6' : idx === 3 ? '6-8' : '8-10';
                const color = idx < 2 ? '#ef4444' : idx === 2 ? '#f59e0b' : '#22c55e';
                return (
                  <View key={idx} style={styles.histoCol}>
                    <View style={[styles.histoBar, { height: `${h}%`, backgroundColor: color }]} />
                    <Text style={styles.histoLabel}>{label}</Text>
                    <Text style={styles.histoCount}>{count}</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ height: 8 }} />
            <Pressable onPress={() => setStage('catalog')} style={[styles.botaoSecundario, { marginTop: 12 }]} android_ripple={{ color: '#e2e8f0' }}>
              <Text style={styles.botaoSecundarioTexto}>Voltar ao catálogo</Text>
            </Pressable>
          </ScrollView>
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
    bottom: 0,
    left: 0,
    right: 0,
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
  pillTempo: { backgroundColor: '#dbeafe' },
  pillQuestao: { backgroundColor: '#f3e8ff' },
  pillFacil: { backgroundColor: '#dcfce7' },
  pillMedio: { backgroundColor: '#fef3c7' },
  pillDificil: { backgroundColor: '#fee2e2' },
  cardPerguntaContainer: {
    position: 'relative',
  },
  pillTempoFixo: {
    position: 'absolute',
    top: -20,
    right: 8,
    zIndex: 10,
  },
  timerCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCircleFixo: {
    position: 'absolute',
    top: -25,
    right: 8,
    zIndex: 10,
  },
  timerCircleTexto: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
  },
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
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
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
  botaoBottomSec: {
    backgroundColor: '#eef2f7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  botaoBottomSecTexto: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Dashboard styles
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 6,
  },
  summaryValue: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
  },
  summaryHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    flex: 1,
    color: '#0f172a',
    fontSize: 14,
  },
  barBg: {
    flex: 2,
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  barValue: {
    width: 44,
    textAlign: 'right',
    color: '#334155',
    fontVariant: ['tabular-nums'],
  },
  histoWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    height: 140,
    paddingHorizontal: 8,
  },
  histoCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  histoBar: {
    width: '80%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  histoLabel: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 11,
  },
  histoCount: {
    color: '#334155',
    fontSize: 12,
  },
});
