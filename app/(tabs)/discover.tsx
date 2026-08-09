import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useActiveEvent } from "@/lib/useActiveEvent";
import { SwipeDeck, SwipeActionButtons, type SwipeDeckHandle } from "@/components/SwipeDeck";
import { SponsorBanner } from "@/components/SponsorBanner";
import { colors, spacing } from "@/lib/theme";
import type { MatchResult } from "@/lib/types";

export default function Discover() {
  const { t } = useTranslation();
  const { event, loading: eventLoading } = useActiveEvent();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [metIds, setMetIds] = useState<Set<string>>(new Set());
  const [followUpCount, setFollowUpCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const deckRef = useRef<SwipeDeckHandle>(null);

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    const [{ data, error }, { data: metRows }, { data: noteRows }] = await Promise.all([
      supabase.rpc("suggested_matches", { p_event_id: event.id, p_limit: 30 }),
      supabase.from("met_contacts").select("contact_id"),
      supabase.from("contact_notes").select("contact_id, note, rating"),
    ]);
    if (!error && data) setMatches(data);
    const metList = ((metRows as { contact_id: string }[]) ?? []).map((r) => r.contact_id);
    setMetIds(new Set(metList));
    const noted = new Set(
      ((noteRows as { contact_id: string; note: string | null; rating: number | null }[]) ?? [])
        .filter((n) => (n.note && n.note.trim()) || n.rating != null)
        .map((n) => n.contact_id)
    );
    setFollowUpCount(metList.filter((cid) => !noted.has(cid)).length);
    setLoading(false);
  }, [event]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function recordSwipe(item: MatchResult, status: "accepted" | "passed") {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    await supabase
      .from("connections")
      .upsert(
        { requester_id: uid, recipient_id: item.user_id, status },
        { onConflict: "requester_id,recipient_id" }
      );
  }

  function handleSwipeLeft(item: MatchResult) {
    // Left = interested / "like to meet"
    recordSwipe(item, "accepted");
  }

  function handleSwipeRight(item: MatchResult) {
    // Right = dismissed / not interested
    recordSwipe(item, "passed");
  }

  if (eventLoading) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  }

  if (!event) {
    return (
      <Centered>
        <Text style={styles.emptyTitle}>{t("discover.noEventTitle")}</Text>
        <Text style={styles.emptyBody}>{t("discover.noEventBody")}</Text>
      </Centered>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.h1}>{t("discover.title")}</Text>
        <Text style={[styles.sub, { marginBottom: spacing.md }]}>
          {t("discover.atEvent", { event: event.name })}
        </Text>
        {followUpCount > 0 && (
          <Pressable style={styles.followUp} onPress={() => router.push("/follow-ups")}>
            <Text style={styles.followUpText}>{t("followups.banner", { count: followUpCount })}</Text>
            <Text style={styles.followUpChevron}>›</Text>
          </Pressable>
        )}
        <SponsorBanner eventId={event.id} />

        {loading && matches.length === 0 ? (
          <Centered>
            <ActivityIndicator color={colors.accent} />
          </Centered>
        ) : (
          <>
            <SwipeDeck
              ref={deckRef}
              data={matches}
              metIds={metIds}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              onPressCard={(item) => router.push(`/person/${item.user_id}`)}
              emptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyBody}>{t("discover.empty")}</Text>
                </View>
              }
            />
            {matches.length > 0 && (
              <SwipeActionButtons
                onPass={() => deckRef.current?.swipeRight()}
                onLike={() => deckRef.current?.swipeLeft()}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  h1: { fontSize: 24, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, marginTop: 2 },
  followUp: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.chipBg,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  followUpText: { flex: 1, color: colors.accentDark, fontWeight: "700" },
  followUpChevron: { color: colors.accentDark, fontSize: 22, fontWeight: "700" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  emptyBody: { color: colors.muted, textAlign: "center" },
});
