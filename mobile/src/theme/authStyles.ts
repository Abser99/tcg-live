import { StyleSheet } from 'react-native';
import { colors, spacing, radius, font } from './index';

export const authStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.base,
    // Give inputs a slight inner shadow feel on Android via elevation: 0
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 8,
    alignItems: 'center' as const,
    marginTop: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonDisabled: { opacity: 0.5, shadowOpacity: 0 },
  buttonText: {
    color: colors.white,
    fontSize: font.base,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  link: { color: colors.textMuted, textAlign: 'center' as const, fontSize: font.md },
  linkAccent: { color: colors.primaryLight, fontWeight: '700' as const },
});
