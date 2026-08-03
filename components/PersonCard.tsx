import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Avatar } from "./Avatar";
import { colors, spacing } from "@/lib/theme";
import type { RoleCategory, VerificationLevel } from "@/lib/types";

interface Props {
  name: string;
  photoUrl?: string | null;
  headline?: string | null;
  org?: string | null;
  role: RoleCategory;
  verification: VerificationLevel;
  sharedInterests?: string[];
  score?: number;
  met?: boolean;
  onPress?: () => void;
}

export function PersonCard({
  name,
  photoUrl,
  headline,
  org,
  role,
  verification,
  sharedInterests,
  score,
  met,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const verified = verification !== "none";
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Avatar name={name} photoUrl={photoUrl} size={44} />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name || t("personCard.unnamed")}
          </Text>
          {verified && <Text style={styles.verified}>✓</Text>}
          {met && (
            <View style={styles.metBadge}>
              <Text style={styles.metBadgeText}>{t("personCard.met")}</Text>
            </View>
          )}
        </View>
        {!!headline && (
          <Text style={styles.headline} numberOfLines={1}>
            {headline}
          </Text>
        )}
        <Text style={styles.meta} numberOfLines={1}>
          {t(`role.${role}`)}
          {org ? ` · ${org}` : ""}
        </Text>
        {!!sharedInterests?.length && (
          <Text style={styles.shared} numberOfLines={1}>
            {t("personCard.shared", { list: sharedInterests.join(", ") })}
          </Text>
        )}
      </View>
      {typeof score === "number" && score > 0 && (
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{score}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  verified: { color: colors.accent, fontWeight: "900" },
  metBadge: { backgroundColor: colors.chipBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  metBadgeText: { color: colors.accentDark, fontSize: 11, fontWeight: "700" },
  headline: { color: colors.text, marginTop: 2 },
  meta: { color: colors.muted, marginTop: 2, fontSize: 13 },
  shared: { color: colors.accentDark, marginTop: 4, fontSize: 12 },
  scoreBadge: {
    backgroundColor: colors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scoreText: { color: colors.accentDark, fontWeight: "700" },
});
