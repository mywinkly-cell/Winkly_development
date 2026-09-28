// apps/mobile/app/wishlist/create.tsx
// Save a place for later. Accepts `url` / `text` / `title` params so a link shared into the
// app (e.g. from an Instagram reel) lands here pre-filled.

import React, { useMemo, useState } from "react";
import { View, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Screen, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { WishlistForm, EMPTY_WISHLIST_FORM, type WishlistFormValues } from "@/components/wishlist/WishlistForm";
import { useModeContext } from "@/providers/ModeContextProvider";
import { createWishlistItem } from "@/lib/wishlistStore";
import { parseSharedLink } from "@/lib/wishlist/sharedLink";

export default function WishlistCreate() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { context } = useModeContext();
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();

  const initial = useMemo<WishlistFormValues>(() => {
    const parsed = parseSharedLink(params.url ?? params.text ?? null);
    return {
      ...EMPTY_WISHLIST_FORM,
      sourceUrl: parsed?.url ?? "",
      title: (params.title ?? parsed?.title ?? "").slice(0, 120),
      latitude: parsed?.latitude,
      longitude: parsed?.longitude,
    };
  }, [params.url, params.text, params.title]);

  const [values, setValues] = useState<WishlistFormValues>(initial);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!values.title.trim()) {
      setTitleError(t("wishlist.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const created = await createWishlistItem({
        title: values.title,
        description: values.description,
        price: values.price,
        address: values.address,
        city: values.city,
        sourceUrl: values.sourceUrl,
        latitude: values.latitude,
        longitude: values.longitude,
        mode: "events",
        savedFrom: values.sourceUrl.trim() ? "link" : "manual",
        sharedModes: values.sharedModes,
      });
      router.replace({ pathname: "/wishlist/details", params: { id: created.id } });
    } catch {
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        onBack
        title={t("wishlist.newTitle")}
        trailing={<TextButton title={t("common.save")} onPress={onSave} disabled={saving} />}
      />
      <Screen>
        <View style={{ height: theme.spacing.lg }} />
        <WishlistForm
          values={values}
          onChange={(v) => {
            setValues(v);
            if (titleError && v.title.trim()) setTitleError(undefined);
          }}
          availableModes={context.permissions}
          titleError={titleError}
        />
        <PrimaryButton
          title={t("wishlist.saveButton")}
          onPress={onSave}
          loading={saving}
          disabled={saving}
          style={{ marginTop: theme.spacing.lg }}
        />
      </Screen>
    </View>
  );
}
