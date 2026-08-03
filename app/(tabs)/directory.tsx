import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useActiveEvent } from "@/lib/useActiveEvent";
import { PersonCard } from "@/components/PersonCard";
import { SponsorBanner } from "@/components/SponsorBanner";
import { colors, spacing } from "@/lib/theme";
import type { RoleCategory, UserProfile, EventRow } from "@/lib/types";

const ROLE_FILTERS: (RoleCategory | "all")[] = [
  "all", "ngo", "journalist", "researcher", "activist", "youth_delegate", "other",
];

export default function Directory() {
  const { event, loading: eventLoading, refresh } = useActiveEvent();

  if (eventLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return event ? (
    <AttendeeList event={event} />
  ) : (
    <JoinEvent onJoined={refresh} />
  );
}

// ---------------------------------------------------------------------------
// Attendee directory (when the user is in an event)
// ---------------------------------------------------------------------------
function AttendeeList({ event }: { event: EventRow }) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [metIds, setMetIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleCategory | "all">("all");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    // RLS ensures we only see co-attendees; we still scope by event for clarity.
    const [{ data }, { data: metRows }] = await Promise.all([
      supabase.from("event_attendees").select("users(*)").eq("event_id", event.id),
      supabase.from("met_contacts").select("contact_id"),
    ]);
    const rows =
      (data as { users: UserProfile }[] | null)?.map((r) => r.users).filter(Boolean) ?? [];
    setPeople(rows);
    setMetIds(new Set(((metRows as { contact_id: string }[]) ?? []).map((r) => r.contact_id)));
    setLoading(false);
  }, [event.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (role !== "all" && p.role !== role) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.org?.toLowerCase().includes(q) ||
        p.headline?.toLowerCase().includes(q)
      );
    });
  }, [people, query, role]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
            <Text style={styles.h1}>{event.name}</Text>
            <SponsorBanner eventId={event.id} />
            <TextInput
              style={styles.search}
              placeholder={t("directory.search")}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={ROLE_FILTERS}
              keyExtractor={(r) => r}
              contentContainerStyle={{ gap: spacing.xs }}
              renderItem={({ item }) => {
                const active = role === item;
                return (
                  <Pressable
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRole(item)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item === "all" ? t("directory.all") : t(`role.${item}`)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        }
        renderItem={({ item }) => (
          <PersonCard
            name={item.name}
            photoUrl={item.photo_url}
            headline={item.headline}
            org={item.org}
            role={item.role}
            verification={item.verification_level}
            met={metIds.has(item.id)}
            onPress={() => router.push(`/person/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.muted}>{t("directory.noMatch")}</Text> : null
        }
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Join an event (when the user hasn't joined one yet)
// ---------------------------------------------------------------------------
function JoinEvent({ onJoined }: { onJoined: () => void }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("status", "active")
      .order("start_date");
    setEvents((data as EventRow[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function join(eventId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    await supabase.from("event_attendees").insert({ user_id: uid, event_id: eventId });
    onJoined();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={<Text style={styles.h1}>{t("directory.joinTitle")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <Text style={styles.eventName}>{item.name}</Text>
            {!!item.location && <Text style={styles.muted}>{item.location}</Text>}
            {!!item.description && (
              <Text style={styles.eventDesc} numberOfLines={3}>
                {item.description}
              </Text>
            )}
            <Pressable style={styles.joinBtn} onPress={() => join(item.id)}>
              <Text style={styles.joinText}>{t("directory.join")}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>{t("directory.noEvents")}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  h1: { fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: "#fff" },
  muted: { color: colors.muted },
  eventCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  eventName: { fontSize: 18, fontWeight: "700", color: colors.text },
  eventDesc: { color: colors.text, marginTop: spacing.xs },
  joinBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  joinText: { color: "#fff", fontWeight: "700" },
});
