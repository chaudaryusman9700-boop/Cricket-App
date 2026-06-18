import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#38bdf8',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'New Match' }}
      />
      <Stack.Screen
        name="scoring"
        options={{ title: 'Live Scoring', headerBackVisible: false }}
      />
      <Stack.Screen
        name="history"
        options={{ title: 'Match History' }}
      />
      <Stack.Screen
        name="charts"
        options={{ title: 'Match Stats' }}
      />
      <Stack.Screen
        name="scorecard"
        options={{ title: 'Scorecard' }}
      />
      <Stack.Screen
        name="players"
        options={{ title: 'Players' }}
      />
      <Stack.Screen
        name="schedule"
        options={{ title: 'Schedule Match' }}
      />
      <Stack.Screen
        name="matchday"
        options={{ title: 'Match Day' }}
      />
      <Stack.Screen
        name="coaching"
        options={{ title: 'AI Coach' }}
      />
    </Stack>
  );
}