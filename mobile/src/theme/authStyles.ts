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
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 6,
    alignItems: 'center' as const,
    marginTop: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.55, shadowOpacity: 0 },
  buttonText: {
    color: colors.white,
    fontSize: font.base,
    fontWeight: '800' as const,
    letterSpacing: 0.6,
  },
  link: { color: colors.textMuted, textAlign: 'center' as const, fontSize: font.md },
  linkAccent: { color: colors.primaryLight, fontWeight: '700' as const },
});
