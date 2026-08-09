import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { View, Text, Image, StyleSheet, Pressable, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing } from "@/lib/theme";
import type { MatchResult } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
const MAX_VISIBLE_STACK = 3;

interface Props {
  data: MatchResult[];
  metIds: Set<string>;
  onSwipeLeft: (item: MatchResult) => void;
  onSwipeRight: (item: MatchResult) => void;
  onPressCard: (item: MatchResult) => void;
  emptyComponent: React.ReactNode;
}

export interface SwipeDeckHandle {
  swipeLeft: () => void;
  swipeRight: () => void;
}

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { data, metIds, onSwipeLeft, onSwipeRight, onPressCard, emptyComponent },
  ref
) {
  const [index, setIndex] = useState(0);
  // Bumping this nonce tells the current top card to animate itself off,
  // used by the tap-to-swipe buttons (drag gestures don't need it).
  const [programmaticSwipe, setProgrammaticSwipe] = useState<{ dir: "left" | "right"; nonce: number } | null>(
    null
  );

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setProgrammaticSwipe(null);
  }, []);

  useImperativeHandle(ref, () => ({
    swipeLeft: () => setProgrammaticSwipe((p) => ({ dir: "left", nonce: (p?.nonce ?? 0) + 1 })),
    swipeRight: () => setProgrammaticSwipe((p) => ({ dir: "right", nonce: (p?.nonce ?? 0) + 1 })),
  }));

  if (index >= data.length) {
    return <View style={styles.deckArea}>{emptyComponent}</View>;
  }

  const visible = data.slice(index, index + MAX_VISIBLE_STACK);

  return (
    <View style={styles.deckArea}>
      {visible
        .map((item, i) => (
          <DeckCard
            key={item.user_id}
            item={item}
            stackIndex={i}
            met={metIds.has(item.user_id)}
            isTop={i === 0}
            programmaticSwipe={i === 0 ? programmaticSwipe : null}
            onSwipeLeft={() => {
              onSwipeLeft(item);
              advance();
            }}
            onSwipeRight={() => {
              onSwipeRight(item);
              advance();
            }}
            onPress={() => onPressCard(item)}
          />
        ))
        .reverse()}
    </View>
  );
});

interface CardProps {
  item: MatchResult;
  stackIndex: number;
  met: boolean;
  isTop: boolean;
  programmaticSwipe: { dir: "left" | "right"; nonce: number } | null;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onPress: () => void;
}

function DeckCard({
  item,
  stackIndex,
  met,
  isTop,
  programmaticSwipe,
  onSwipeLeft,
  onSwipeRight,
  onPress,
}: CardProps) {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (!programmaticSwipe) return;
    const toX = programmaticSwipe.dir === "left" ? -SCREEN_WIDTH * 1.5 : SCREEN_WIDTH * 1.5;
    translateX.value = withTiming(toX, { duration: 220 }, (finished) => {
      if (finished) {
        if (programmaticSwipe.dir === "left") runOnJS(onSwipeLeft)();
        else runOnJS(onSwipeRight)();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmaticSwipe?.nonce]);

  const pan = Gesture.Pan()
    .enabled(isTop)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.4;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onSwipeLeft)();
        });
      } else if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onSwipeRight)();
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd(() => {
      runOnJS(onPress)();
    });

  // Tap gets first chance to recognize; if the touch moves beyond tap's
  // maxDistance, tap fails and pan takes over the same gesture stream.
  const composed = Gesture.Exclusive(tap, pan);

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-12, 0, 12],
      Extrapolation.CLAMP
    );
    // Stacked cards behind the top one: scaled down and offset upward slightly.
    const restScale = 1 - stackIndex * 0.04;
    const restTranslateY = stackIndex * -10;

    return {
      transform: [
        { translateX: isTop ? translateX.value : 0 },
        { translateY: isTop ? translateY.value : restTranslateY },
        { rotate: isTop ? `${rotate}deg` : "0deg" },
        { scale: isTop ? 1 : restScale },
      ],
      zIndex: MAX_VISIBLE_STACK - stackIndex,
    };
  });

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const passStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const initials = (item.name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.card, cardStyle]}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoFallbackText}>{initials}</Text>
          </View>
        )}

        {isTop && (
          <>
            <Animated.View style={[styles.stamp, styles.likeStamp, likeStampStyle]}>
              <Text style={[styles.stampText, styles.likeStampText]}>{t("discover.like")}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.passStamp, passStampStyle]}>
              <Text style={[styles.stampText, styles.passStampText]}>{t("discover.pass")}</Text>
            </Animated.View>
          </>
        )}

        <View style={styles.infoOverlay}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name || t("personCard.unnamed")}
            </Text>
            {item.verification_level !== "none" && <Text style={styles.verified}>✓</Text>}
            {met && (
              <View style={styles.metBadge}>
                <Text style={styles.metBadgeText}>{t("personCard.met")}</Text>
              </View>
            )}
          </View>
          {!!item.headline && (
            <Text style={styles.headline} numberOfLines={1}>
              {item.headline}
            </Text>
          )}
          <Text style={styles.meta} numberOfLines={1}>
            {t(`role.${item.role}`)}
            {item.org ? ` · ${item.org}` : ""}
          </Text>
          {!!item.shared_interests?.length && (
            <Text style={styles.shared} numberOfLines={2}>
              {t("personCard.shared", { list: item.shared_interests.join(", ") })}
            </Text>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Small tap-to-swipe buttons, for people who'd rather not drag. */
export function SwipeActionButtons({
  onPass,
  onLike,
  disabled,
}: {
  onPass: () => void;
  onLike: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.actionRow}>
      <Pressable
        style={[styles.actionBtn, styles.passBtn]}
        onPress={onPass}
        disabled={disabled}
      >
        <Text style={styles.actionBtnText}>✕</Text>
      </Pressable>
      <Pressable
        style={[styles.actionBtn, styles.likeBtn]}
        onPress={onLike}
        disabled={disabled}
      >
        <Text style={styles.actionBtnText}>♥</Text>
      </Pressable>
    </View>
  );
}

const CARD_HEIGHT = 480;

const styles = StyleSheet.create({
  deckArea: {
    height: CARD_HEIGHT + 20,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    width: SCREEN_WIDTH - spacing.lg * 2,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.chipBg,
  },
  photoFallbackText: {
    fontSize: 64,
    fontWeight: "800",
    color: colors.accentDark,
  },
  infoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 20, fontWeight: "800", color: "#fff", flexShrink: 1 },
  verified: { color: "#8fe3a0", fontWeight: "900" },
  metBadge: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  metBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  headline: { color: "#f0f0f0", marginTop: 2 },
  meta: { color: "#d8d8d8", marginTop: 2, fontSize: 13 },
  shared: { color: "#bcefc7", marginTop: 6, fontSize: 12 },
  stamp: {
    position: "absolute",
    top: 32,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  likeStamp: { right: 20, borderColor: "#4CD964", transform: [{ rotate: "-12deg" }] },
  passStamp: { left: 20, borderColor: "#FF3B30", transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 26, fontWeight: "900" },
  likeStampText: { color: "#4CD964" },
  passStampText: { color: "#FF3B30" },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  passBtn: {},
  likeBtn: {},
  actionBtnText: { fontSize: 24, fontWeight: "700", color: colors.text },
});
