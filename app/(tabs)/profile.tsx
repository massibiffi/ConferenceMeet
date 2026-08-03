import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useActiveEvent } from "@/lib/useActiveEvent";
import { Avatar } from "@/components/Avatar";
import { startSharing, stopSharing } from "@/lib/location";
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n";
import { colors, spacing } from "@/lib/theme";
import {
  ROLE_LABELS,
  type Interest,
  type RoleCategory,
  type UserProfile,
} from "@/lib/types";

const ROLES = Object.keys(ROLE_LABELS) as RoleCategory[];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const { event } = useActiveEvent();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({ role: "other" });
  const [allInterests, setAllInterests] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const [{ data: prof }, { data: interests }, { data: mine }, { data: loc }] =
      await Promise.all([
        supabase.from("users").select("*").eq("id", uid).maybeSingle(),
        supabase.from("interests").select("*").order("label"),
        supabase.from("user_interests").select("interest_id").eq("user_id", uid),
        supabase.from("user_locations").select("sharing_expires_at").eq("user_id", uid).maybeSingle(),
      ]);

    setProfile((prof as UserProfile) ?? { id: uid, role: "other" });
    setAllInterests((interests as Interest[]) ?? []);
    setSelected(new Set(((mine as { interest_id: number }[]) ?? []).map((r) => r.interest_id)));
    const exp = (loc as { sharing_expires_at: string } | null)?.sharing_expires_at;
    setSharing(!!exp && new Date(exp) > new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function toggleInterest(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const { error } = await supabase.from("users").upsert({
      id: uid,
      name: profile.name ?? "",
      headline: profile.headline ?? null,
      org: profile.org ?? null,
      role: profile.role ?? "other",
      bio: profile.bio ?? null,
      intent_text: profile.intent_text ?? null,
    });

    // Sync interests: clear + reinsert (small sets; fine for v1).
    await supabase.from("user_interests").delete().eq("user_id", uid);
    if (selected.size) {
      await supabase
        .from("user_interests")
        .insert([...selected].map((interest_id) => ({ user_id: uid, interest_id })));
    }

    setSaving(false);
    Alert.alert(
      error ? t("profile.saveFailed") : t("profile.savedTitle"),
      error?.message ?? t("profile.savedBody")
    );
  }

  async function toggleSharing() {
    if (sharing) {
      await stopSharing();
      setSharing(false);
      return;
    }
    if (!event) {
      Alert.alert(t("profile.location.needEventTitle"), t("profile.location.needEventBody"));
      return;
    }
    const { error } = await startSharing({ eventId: event.id, hours: 2 });
    if (error) Alert.alert(t("profile.location.startFailed"), error);
    else setSharing(true);
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
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={styles.h1}>{t("profile.title")}</Text>

        <View style={styles.avatarRow}>
          <Avatar name={profile.name} photoUrl={profile.photo_url} size={72} />
        </View>

        <Field label={t("profile.name")}>
          <TextInput style={styles.input} value={profile.name ?? ""} onChangeText={(v) => set("name", v)} />
        </Field>
        <Field label={t("profile.headline")}>
          <TextInput
            style={styles.input}
            placeholder={t("profile.headlinePlaceholder")}
            value={profile.headline ?? ""}
            onChangeText={(v) => set("headline", v)}
          />
        </Field>
        <Field label={t("profile.org")}>
          <TextInput style={styles.input} value={profile.org ?? ""} onChangeText={(v) => set("org", v)} />
        </Field>

        <Field label={t("profile.role")}>
          <View style={styles.rolesRow}>
            {ROLES.map((r) => {
              const active = profile.role === r;
              return (
                <Pressable
                  key={r}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => set("role", r)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t(`role.${r}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label={t("profile.intent")}>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t("profile.intentPlaceholder")}
            multiline
            value={profile.intent_text ?? ""}
            onChangeText={(v) => set("intent_text", v)}
          />
        </Field>

        <Field label={t("profile.bio")}>
          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={profile.bio ?? ""}
            onChangeText={(v) => set("bio", v)}
          />
        </Field>

        <Field label={t("profile.interests", { count: selected.size })}>
          <View style={styles.rolesRow}>
            {allInterests.map((i) => {
              const active = selected.has(i.id);
              return (
                <Pressable
                  key={i.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleInterest(i.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {i.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? t("profile.saving") : t("profile.save")}</Text>
        </Pressable>

        {/* Location: opt-in, coarse, ephemeral. Off by default. */}
        <View style={styles.locationCard}>
          <Text style={styles.locationTitle}>{t("profile.location.title")}</Text>
          <Text style={styles.muted}>{t("profile.location.explainer")}</Text>
          <Pressable
            style={[styles.locationBtn, sharing && styles.locationBtnOn]}
            onPress={toggleSharing}
          >
            <Text style={[styles.locationBtnText, sharing && { color: "#fff" }]}>
              {sharing ? t("profile.location.shareOn") : t("profile.location.shareOff")}
            </Text>
          </Pressable>
        </View>

        {/* Language switcher */}
        <Field label={t("profile.language")}>
          <View style={styles.rolesRow}>
            {SUPPORTED_LANGUAGES.map((lng) => {
              const active = i18n.language === lng;
              return (
                <Pressable
                  key={lng}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setLanguage(lng as Language)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t(`language.${lng}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Pressable style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>{t("common.signOut")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  h1: { fontSize: 24, fontWeight: "800", color: colors.text },
  avatarRow: { alignItems: "center" },
  label: { fontWeight: "600", color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
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
  saveBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: spacing.md, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  locationCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  locationTitle: { fontWeight: "700", color: colors.text, fontSize: 16 },
  locationBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
  },
  locationBtnOn: { backgroundColor: colors.accent },
  locationBtnText: { color: colors.accent, fontWeight: "600" },
  signOut: { padding: spacing.md, alignItems: "center", marginTop: spacing.lg },
  signOutText: { color: colors.danger, fontWeight: "600" },
});
