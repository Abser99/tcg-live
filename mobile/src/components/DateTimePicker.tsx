import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../theme';

interface Props {
  visible: boolean;
  value: Date | null;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const WEEK = ['D','L','M','X','J','V','S'];

export default function DateTimePicker({ visible, value, onConfirm, onCancel }: Props) {
  const seed = value ?? new Date();
  const [year, setYear]   = useState(seed.getFullYear());
  const [month, setMonth] = useState(seed.getMonth());
  const [day, setDay]     = useState(seed.getDate());
  const [hour, setHour]   = useState(seed.getHours());
  const [min, setMin]     = useState(Math.round(seed.getMinutes() / 15) * 15 % 60);

  useEffect(() => {
    if (!visible) return;
    const d = value ?? new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDay(d.getDate());
    setHour(d.getHours());
    setMin(Math.round(d.getMinutes() / 15) * 15 % 60);
  }, [visible]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const selectedDay  = Math.min(day, daysInMonth);

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1);

  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* Month / Year navigation */}
          <View style={s.nav}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.navTitle}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Week headers */}
          <View style={s.weekRow}>
            {WEEK.map(d => <Text key={d} style={s.weekDay}>{d}</Text>)}
          </View>

          {/* Day grid */}
          <View style={s.grid}>
            {cells.map((d, i) => {
              const isSelected = d === selectedDay;
              const isToday = d !== null &&
                d === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.cell, isSelected && s.cellSelected]}
                  onPress={() => d && setDay(d)}
                  disabled={!d}
                  activeOpacity={d ? 0.7 : 1}
                >
                  {d != null && (
                    <Text style={[
                      s.cellText,
                      isSelected && s.cellTextSelected,
                      isToday && !isSelected && s.cellToday,
                    ]}>
                      {d}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Time picker */}
          <View style={s.timeRow}>
            <Text style={s.timeLabel}>Hora</Text>
            <TimeSpinner value={hour} onChange={setHour} max={23} />
            <Text style={s.timeSep}>:</Text>
            <TimeSpinner value={min} onChange={setMin} max={45} step={15} />
          </View>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={onCancel}>
              <Text style={s.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnConfirm]}
              onPress={() => onConfirm(new Date(year, month, selectedDay, hour, min))}
            >
              <Text style={s.btnConfirmText}>Confirmar</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

function TimeSpinner({ value, onChange, max, step = 1 }: {
  value: number; onChange: (v: number) => void; max: number; step?: number;
}) {
  const inc = () => onChange(value + step > max ? 0 : value + step);
  const dec = () => onChange(value - step < 0 ? max : value - step);
  return (
    <View style={s.spinner}>
      <TouchableOpacity onPress={inc} style={s.spinBtn}>
        <Ionicons name="chevron-up" size={18} color={colors.primary} />
      </TouchableOpacity>
      <Text style={s.spinValue}>{String(value).padStart(2, '0')}</Text>
      <TouchableOpacity onPress={dec} style={s.spinBtn}>
        <Ionicons name="chevron-down" size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '100%',
    maxWidth: 340,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.xs },
  navTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekDay: {
    flex: 1, textAlign: 'center',
    color: colors.textMuted, fontSize: font.sm, fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  cellSelected: { backgroundColor: colors.primary },
  cellText: { color: colors.text, fontSize: font.md },
  cellTextSelected: { color: colors.white, fontWeight: '700' },
  cellToday: { color: colors.primaryLight, fontWeight: '700' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.md,
  },
  timeLabel: { color: colors.textMuted, fontSize: font.md, fontWeight: '600' },
  timeSep: { color: colors.text, fontSize: font.xxl, fontWeight: '700', marginBottom: 4 },
  spinner: { alignItems: 'center' },
  spinBtn: { padding: spacing.xs },
  spinValue: {
    color: colors.text, fontSize: font.xxl, fontWeight: '700',
    minWidth: 44, textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1, paddingVertical: spacing.md,
    borderRadius: radius.md, alignItems: 'center',
  },
  btnCancel: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  btnConfirm: { backgroundColor: colors.primary },
  btnCancelText: { color: colors.textMuted, fontWeight: '600', fontSize: font.md },
  btnConfirmText: { color: colors.white, fontWeight: '700', fontSize: font.md },
});
