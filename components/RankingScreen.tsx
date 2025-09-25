import { buscarRanking, getCurrentUserProfile, RankingUser, UserProfile } from '@/lib/userService';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface RankingScreenProps {
  onBack: () => void;
}

export default function RankingScreen({ onBack }: RankingScreenProps) {
  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRanking();
  }, []);

  const loadRanking = async () => {
    try {
      setLoading(true);
      const [rankingData, userData] = await Promise.all([
        buscarRanking(50), // Top 50
        getCurrentUserProfile()
      ]);
      
      setRanking(rankingData);
      setCurrentUser(userData);
    } catch (error) {
      console.error('Erro ao carregar ranking:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRanking();
    setRefreshing(false);
  };

  const renderRankingItem = (user: RankingUser, index: number) => {
    const isCurrentUser = currentUser && user.nome === currentUser.nome;
    const isTopThree = index < 3;
    
    return (
      <View
        key={`${user.nome}-${user.score}-${index}`}
        style={[
          styles.rankingItem,
          isCurrentUser && styles.currentUserItem,
          isTopThree && styles.topThreeItem
        ]}
      >
        <View style={styles.positionContainer}>
          <Text style={[
            styles.position,
            isTopThree && styles.topThreePosition
          ]}>
            {user.posicao}
          </Text>
          {isTopThree && (
            <Text style={styles.medal}>
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </Text>
          )}
        </View>

        <View style={styles.userInfo}>
          {user.fotoURL ? (
            <Image
              source={{ uri: user.fotoURL }}
              style={[styles.avatar, isTopThree && styles.topThreeAvatar]}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, isTopThree && styles.topThreeAvatar]}>
              <Text style={styles.avatarPlaceholderText}>
                {user.nome.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          
          <View style={styles.nameContainer}>
            <Text style={[
              styles.name,
              isCurrentUser && styles.currentUserName,
              isTopThree && styles.topThreeName
            ]}>
              {user.nome}
            </Text>
            {isCurrentUser && (
              <Text style={styles.youLabel}>Você</Text>
            )}
          </View>
        </View>

        <View style={styles.scoreContainer}>
          <Text style={[
            styles.score,
            isTopThree && styles.topThreeScore
          ]}>
            {user.score.toLocaleString()}
          </Text>
          <Text style={styles.pointsLabel}>pts</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Carregando ranking...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.title}>🏆 Ranking Global</Text>
        <Text style={styles.subtitle}>Top jogadores do BibleQuiz</Text>
      </View>

      <ScrollView
        style={styles.rankingList}
        contentContainerStyle={styles.rankingContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {ranking.length > 0 ? (
          ranking.map((user, index) => renderRankingItem(user, index))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum jogador encontrado</Text>
            <Text style={styles.emptySubtext}>
              Seja o primeiro a aparecer no ranking!
            </Text>
          </View>
        )}
      </ScrollView>

      {currentUser && (
        <View style={styles.currentUserSummary}>
          <Text style={styles.summaryTitle}>Sua Posição</Text>
          <View style={styles.summaryContent}>
            <Text style={styles.summaryScore}>{currentUser.score} pts</Text>
            <Text style={styles.summaryText}>
              Posição: #{ranking.findIndex(u => u.nome === currentUser.nome) + 1 || 'N/A'}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  rankingList: {
    flex: 1,
  },
  rankingContent: {
    padding: 16,
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  currentUserItem: {
    borderColor: '#3b82f6',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  topThreeItem: {
    borderColor: '#f59e0b',
    borderWidth: 2,
    backgroundColor: '#fffbeb',
  },
  positionContainer: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 40,
  },
  position: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  topThreePosition: {
    fontSize: 20,
    color: '#f59e0b',
  },
  medal: {
    fontSize: 12,
    marginTop: 2,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  topThreeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  nameContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  currentUserName: {
    color: '#3b82f6',
  },
  topThreeName: {
    fontSize: 18,
    color: '#92400e',
  },
  youLabel: {
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  topThreeScore: {
    fontSize: 20,
    color: '#f59e0b',
  },
  pointsLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  currentUserSummary: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  summaryText: {
    fontSize: 16,
    color: '#6b7280',
  },
});