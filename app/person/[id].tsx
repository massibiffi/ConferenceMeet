import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";
import { StarRating } from "@/components/StarRating";
import { colors, spacing } from "@/lib/theme";
import type { ConnectionStatus, UserProfile } from "@/lib/types";

export default function PersonDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus | "none">("none");
  const [met, setMet] = useState(false);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesJustSaved, setNotesJustSaved] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setMeId(uid);

    const [{ data: prof }, { data: ints }, { data: conn }, { data: metRow }, { data: noteRow }, { data: privRow }] =
      await Promise.all([
        supabase.from("users").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_interests").select("interests(label)").eq("user_id", id),
        supabase
          .from("connections")
          .select("status, requester_id, recipient_id")
          .or(
            `and(requester_id.eq.${uid},recipient_id.eq.${id}),and(requester_id.eq.${id},recipient_id.eq.${uid})`
          )
          .maybeSingle(),
        supabase.from("met_contacts").select("contact_id").eq("user_id", uid).eq("contact_id", id).maybeSingle(),
        supabase.from("contact_notes").select("note, rating").eq("owner_id", uid).eq("contact_id", id).maybeSingle(),
        supabase
          .from("contact_privacy")
          .select("hidden, hide_location")
          .eq("owner_id", uid)
          .eq("contact_id", id)
          .maybeSingle(),
      ]);

    setPerson((prof as UserProfile) ?? null);
    setInterests(
      ((ints as { interests: { label: string } }[] | null) ?? []).map((r) => r.interests.label)
    );
    setStatus(((conn as { status: ConnectionStatus } | null)?.status) ?? "none");
    setMet(!!metRow);
    const nr = noteRow as { note: string | null; rating: number | null } | null;
    setNote(nr?.note ?? "");
    setRating(nr?.rating ?? null);
    const pr = privRow as { hidden: boolean; hide_location: boolean } | null;
    setHidden(pr?.hidden ?? false);
    setHideLocation(pr?.hide_location ?? false);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleMet() {
    if (!meId || !id) return;
    const next = !met;
    setMet(next); // optimistic
    const { error } = next
      ? await supabase.from("met_contacts").insert({ user_id: meId, contact_id: id })
      : await supabase.from("met_contacts").delete().eq("user_id", meId).eq("contact_id", id);
    if (error) {
      setMet(!next); // revert on failure
      Alert.alert(t("person.requestFailed"), error.message);
      return;
    }
    // Feature 3: in-app follow-up nudge right after marking someone met.
    if (next && !note && rating == null) {
      Alert.alert(
        t("person.metNudgeTitle", { name: person?.name ?? "" }),
        t("person.metNudgeBody"),
        [
          { text: t("common.notNow"), style: "cancel" },
          { text: t("person.metNudgeAdd") },
        ]
      );
    }
  }

  async function saveNotes() {
    if (!meId || !id) return;
    setSavingNotes(true);
    setNotesJustSaved(false);
    const { error } = await supabase.from("contact_notes").upsert({
      owner_id: meId,
      contact_id: id,
      note: note.trim() || null,
      rating,
      updated_at: new Date().toISOString(),
    });
    setSavingNotes(false);
    if (error) {
      Alert.alert(t("person.requestFailed"), error.message);
      return;
    }
    setNotesJustSaved(true);
    setTimeout(() => setNotesJustSaved(false), 2000);
  }

  async function setPrivacy(next: { hidden?: boolean; hide_location?: boolean }) {
    if (!meId || !id) return;
    const merged = { hidden, hide_location: hideLocation, ...next };
    setHidden(merged.hidden); // optimistic
    setHideLocation(merged.hide_location);
    const { error } = await supabase.from("contact_privacy").upsert({
      owner_id: meId,
      contact_id: id,
      hidden: merged.hidden,
      hide_location: merged.hide_location,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setHidden(hidden); // revert
      setHideLocation(hideLocation);
      Alert.alert(t("person.requestFailed"), error.message);
    }
  }

  function openChat() {
    if (!id) return;
    // Chat requires an accepted connection - only reachable once status === "accepted",
    // which is only ever set via a swipe-left "like" on the Discover tab (see
    // app/(tabs)/discover.tsx). There is no in-app "Connect" button anymore.
    // The open-channel Edge Function re-verifies this server-side too.
    router.push({
      pathname: "/chat/[peerId]",
      params: { peerId: id, peerName: person?.name ?? t("chat.title") },
    });
  }

  function report() {
    Alert.alert(t("person.reportConfirmTitle"), t("person.reportConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("person.report"),
        style: "destructive",
        onPress: async () => {
          if (!meId || !id) return;
          await supabase.from("reports").insert({
            reporter_id: meId,
            reported_user_id: id,
            reason: "Reported from profile",
          });
          Alert.alert(t("person.reportThanksTitle"), t("person.reportThanksBody"));
        },
      },
    ]);
  }

  async function block() {
    if (!meId || !id) return;
    await supabase
      .from("connections")
      .upsert({ requester_id: meId, recipient_id: id, status: "blocked" });
    setStatus("blocked");
    Alert.alert(t("person.blockedTitle"), t("person.blockedBody"));
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!person) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t("person.unavailable")}</Text>
      </View>
    );
  }

  const verified = person.verification_level !== "none";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: person.name || t("tabs.profile") }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Avatar name={person.name} photoUrl={person.photo_url} size={64} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{person.name || t("personCard.unnamed")}</Text>
              {verified && <Text style={styles.verified}>✓</Text>}
            </View>
            {!!person.headline && <Text style={styles.headline}>{person.headline}</Text>}
            <Text style={styles.muted}>
              {t(`role.${person.role}`)}
              {person.org ? ` · ${person.org}` : ""}
            </Text>
          </View>
        </View>

        {!!person.intent_text && (
          <Section title={t("person.hereTo")}>
            <Text style={styles.body}>{person.intent_text}</Text>
          </Section>
        )}
        {!!person.bio && (
          <Section title={t("person.about")}>
            <Text style={styles.body}>{person.bio}</Text>
          </Section>
        )}
        {!!interests.length && (
          <Section title={t("person.interests")}>
            <View style={styles.chipsWrap}>
              {interests.map((label) => (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {status !== "blocked" && (
          <>
            {/*
              Connecting only happens via a swipe-left "like" on the Discover tab
              (app/(tabs)/discover.tsx) - there is no "Connect" button here anymore.
              "Message" only appears once status === "accepted".
            */}
            {status === "accepted" && (
              <Pressable style={styles.primaryBtn} onPress={openChat}>
                <Text style={styles.primaryText}>{t("person.message")}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.metBtn, met && styles.metBtnOn]}
              onPress={toggleMet}
            >
              <Text style={[styles.metText, met && styles.metTextOn]}>
                {met ? `✓ ${t("person.met")}` : t("person.markMet")}
              </Text>
            </Pressable>

            {/* Feature 2: private notes + rating */}
            <View style={styles.crmCard}>
              <Text style={styles.crmTitle}>{t("person.notesTitle")}</Text>
              <Text style={styles.crmLabel}>{t("person.rating")}</Text>
              <StarRating value={rating} onChange={setRating} />
              <TextInput
                style={styles.notesInput}
                placeholder={t("person.notesPlaceholder")}
                multiline
                value={note}
                onChangeText={setNote}
              />
              <View style={styles.saveNotesRow}>
                <Pressable style={styles.saveNotesBtn} onPress={saveNotes} disabled={savingNotes}>
                  <Text style={styles.saveNotesText}>
                    {savingNotes ? t("common.saving") : t("person.saveNotes")}
                  </Text>
                </Pressable>
                {notesJustSaved && (
                  <Text style={styles.savedConfirmation}>✓ {t("common.saved")}</Text>
                )}
              </View>
            </View>

            {/* Feature 1: per-contact privacy */}
            <View style={styles.crmCard}>
              <Text style={styles.crmTitle}>{t("person.privacyTitle")}</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t("person.hideMe")}</Text>
                <Switch
                  value={hidden}
                  onValueChange={(v) => setPrivacy({ hidden: v })}
                  trackColor={{ true: colors.accent }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t("person.hideLocation")}</Text>
                <Switch
                  value={hideLocation}
                  onValueChange={(v) => setPrivacy({ hide_location: v })}
                  trackColor={{ true: colors.accent }}
                />
              </View>
            </View>
          </>
        )}

        <View style={styles.safetyRow}>
          <Pressable onPress={report}>
            <Text style={styles.danger}>{t("person.report")}</Text>
          </Pressable>
          <Text style={styles.muted}>·</Text>
          <Pressable onPress={block}>
            <Text style={styles.danger}>
              {status === "blocked" ? t("person.blocked") : t("person.block")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  verified: { color: colors.accent, fontWeight: "900", fontSize: 18 },
  headline: { color: colors.text, marginTop: 2 },
  muted: { color: colors.muted },
  sectionTitle: { fontWeight: "700", color: colors.text, fontSize: 15 },
  body: { color: colors.text, lineHeight: 20 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { backgroundColor: colors.chipBg, borderRadius: 16, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipText: { color: colors.accentDark, fontSize: 13 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, padding: spacing.md, alignItems: "center" },
  secondaryText: { color: colors.accent, fontWeight: "600" },
  metBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, alignItems: "center" },
  metBtnOn: { backgroundColor: colors.chipBg, borderColor: colors.accent },
  metText: { color: colors.muted, fontWeight: "600" },
  metTextOn: { color: colors.accentDark },
  crmCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  crmTitle: { fontWeight: "700", color: colors.text, fontSize: 16 },
  crmLabel: { color: colors.muted, fontSize: 13 },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveNotesRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  saveNotesBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: spacing.md, alignItems: "center", flex: 1 },
  saveNotesText: { color: "#fff", fontWeight: "700" },
  savedConfirmation: { color: colors.accentDark, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  switchLabel: { color: colors.text, flex: 1 },
  safetyRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.lg },
  danger: { color: colors.danger, fontWeight: "600" },
});
