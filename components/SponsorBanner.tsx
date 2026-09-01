import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { weightedPick } from "@/lib/sponsors";
import { colors, spacing } from "@/lib/theme";
import type { Sponsor } from "@/lib/types";

/**
 * DEV-ONLY fallback sponsor, shown when an event has no real rows in the
 * `sponsors` table yet. Lets the banner be tested/styled without needing to
 * seed real sponsor data. Never shown in production builds (__DEV__ gate below).
 */
const FAKE_SPONSOR: Sponsor = {
  id: "fake-sponsor-dev",
  event_id: "dev",
  name: "Acme Renewables",
  tagline: "Powering tomorrow, today.",
  logo_url: null,
  link_url: "https://example.com",
  is_active: true,
  weight: 1,
} as Sponsor;

/**
 * Shows one sponsor ad for the given event, rotating every ~12s when there are
 * several. Renders nothing when the event has no active sponsors — ads are
 * opt-in per event, so unsponsored events stay ad-free.
 */
export function SponsorBanner({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [current, setCurrent] = useState<Sponsor | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("sponsors")
        .select("*")
        .eq("event_id", eventId)
        .eq("is_active", true);
      if (!active) return;
      let list = (data as Sponsor[]) ?? [];
      // DEV-ONLY: fall back to a fake sponsor so the banner is visible/testable
      // even when the event has no real sponsors seeded yet. Remove this
      // fallback (or leave it - it's __DEV__-gated) once real sponsors exist.
      if (list.length === 0 && __DEV__) {
        list = [FAKE_SPONSOR];
      }
      setSponsors(list);
      setCurrent(weightedPick(list));
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (sponsors.length < 2) return;
    const t = setInterval(() => setCurrent(weightedPick(sponsors)), 12000);
    return () => clearInterval(t);
  }, [sponsors]);

  if (!current) return null;

  async function open() {
    if (current?.link_url) {
      // TODO(analytics): record a click here (e.g. a sponsor_clicks insert or an
      // Edge Function) if the NGO wants to report engagement to sponsors.
      await WebBrowser.openBrowserAsync(current.link_url);
    }
  }

  return (
    <Pressable style={styles.banner} onPress={open} accessibilityRole="button">
      {current.logo_url ? (
        <Image source={{ uri: current.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, styles.logoFallback]}>
          <Text style={styles.logoFallbackText}>{current.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {current.name}
        </Text>
        {!!current.tagline && (
          <Text style={styles.tagline} numberOfLines={1}>
            {current.tagline}
          </Text>
        )}
      </View>
      <Text style={styles.adTag}>{t("common.ad")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  logo: { width: 40, height: 40, borderRadius: 8 },
  logoFallback: { backgroundColor: colors.chipBg, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: colors.accentDark, fontWeight: "800", fontSize: 13 },
  name: { fontWeight: "700", color: colors.text },
  tagline: { color: colors.muted, fontSize: 13, marginTop: 1 },
  adTag: {
    color: colors.muted,
    fontSize: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
});
