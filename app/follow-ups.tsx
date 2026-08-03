import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { PersonCard } from "@/components/PersonCard";
import { colors, spacing } from "@/lib/theme";
import type { UserProfile } from "@/lib/types";

// People you marked as "met" but for whom you haven't written a note or rating yet.
export default function FollowUps() {
  const { t } = useTranslation();
  const router = useRouter();
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setPeople([]);
      setLoading(false);
      return;
    }

    const [{ data: metRows }, { data: noteRows }] = await Promise.all([
      supabase.from("met_contacts").select("contact_id").eq("user_id", uid),
      supabase.from("contact_notes").select("contact_id, note, rating").eq("owner_id", uid),
    ]);

    // A contact is "noted" if they have a note text or a rating.
    const noted = new Set(
      ((noteRows as { contact_id: string; note: string | null; rating: number | null }[]) ?? [])
        .filter((n) => (n.note && n.note.trim()) || n.rating != null)
        .map((n) => n.contact_id)
    );
    const pendingIds = ((metRows as { contact_id: string }[]) ?? [])
      .map((r) => r.contact_id)
      .filter((cid) => !noted.has(cid));

    if (!pendingIds.length) {
      setPeople([]);
      setLoading(false);
      return;
    }
    // RLS still applies: a contact who hid from you won't come back and drops off the list.
    const { data: users } = await supabase.from("users").select("*").in("id", pendingIds);
    setPeople((users as UserProfile[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("followups.title") }} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={
            people.length ? <Text style={styles.subtitle}>{t("followups.subtitle")}</Text> : null
          }
          renderItem={({ item }) => (
            <PersonCard
              name={item.name}
              photoUrl={item.photo_url}
              headline={item.headline}
              org={item.org}
              role={item.role}
              verification={item.verification_level}
              met
              onPress={() => router.push(`/person/${item.id}`)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>{t("followups.empty")}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  subtitle: { color: colors.muted, marginBottom: spacing.md },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
});
