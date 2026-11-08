import React from 'react';
import { Pressable, Text } from 'react-native';
import { LOGO_DATA_URI } from '../assets/logo';
import { addDays, addMonths, currentMonth, dateLabel, monthLabel, todayLocal, weekContaining } from '../core/months';
import { monthlyReport, weeklyReport } from '../core/reports';
import { Audience, monthlyReportHtml, REPORT_PAGE, weeklyReportHtml } from '../core/templates/reportHtml';
import { sharePdf } from '../platform/files';
import { attempt, useApp, useLoad } from '../ui/app';
import { Btn, C, Card, KV, Muted, Row, s, Screen, Segmented } from '../ui/kit';

type Kind = 'weekly' | 'monthly';

export function ReportsScreen() {
  const { repo } = useApp();
  const [kind, setKind] = React.useState<Kind>('weekly');
  const [audience, setAudience] = React.useState<Audience>('group');
  const [weekOf, setWeekOf] = React.useState(todayLocal());
  const [month, setMonth] = React.useState(currentMonth());
  const [busy, setBusy] = React.useState(false);
  const week = weekContaining(weekOf);

  const { data } = useLoad(async () => {
    if (kind === 'weekly') {
      const d = await repo.reportData(week.from, week.to);
      return { kind, weekly: weeklyReport(week.from, week.to, d.payments) } as const;
    }
    // Year-to-date figures need every payment from 1 January.
    const d = await repo.reportData(`${month.slice(0, 4)}-01-01`, `${month}-31`);
    return { kind, monthly: monthlyReport(month, d.members, d.payments, d.exempt) } as const;
  }, [kind, week.from, month]);

  const period = kind === 'weekly' ? `${dateLabel(week.from)} – ${dateLabel(week.to)}` : monthLabel(month);
  const step = (n: number) => (kind === 'weekly' ? setWeekOf(addDays(week.from, 7 * n)) : setMonth(addMonths(month, n)));

  const share = async () => {
    if (!data) return;
    setBusy(true);
    const stamp = new Date().toLocaleString();
    const html =
      data.kind === 'weekly' ? weeklyReportHtml(data.weekly, audience, LOGO_DATA_URI, stamp) : monthlyReportHtml(data.monthly, audience, LOGO_DATA_URI, stamp);
    const name = data.kind === 'weekly' ? `Youth subs week ${week.from}` : `Youth subs ${month}`;
    await attempt(() => sharePdf(html, `${name}${audience === 'leadership' ? ' LEADERSHIP' : ''}.pdf`, REPORT_PAGE, 'Share report'), 'Could not share report');
    setBusy(false);
  };

  return (
    <Screen title="Reports">
      <Segmented value={kind} onChange={setKind} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable onPress={() => step(-1)} hitSlop={12}>
          <Text style={{ fontSize: 22, color: C.blue }}>‹</Text>
        </Pressable>
        <Text style={[s.h, { marginBottom: 0 }]}>{period}</Text>
        <Pressable onPress={() => step(1)} hitSlop={12}>
          <Text style={{ fontSize: 22, color: C.blue }}>›</Text>
        </Pressable>
      </Row>

      {data?.kind === 'weekly' ? (
        <Card>
          <KV k="Collected" v={`$${data.weekly.totals.total}`} />
          <KV k="Cash / Mobile money" v={`$${data.weekly.totals.cash} / $${data.weekly.totals.mobile}`} />
          <KV k="Receipts" v={data.weekly.totals.receipts} />
          <KV k="Members who paid" v={data.weekly.membersPaying} />
          <KV k="Voided" v={data.weekly.voided.length} />
          {data.weekly.ranges.some((r) => r.missing.length) ? <Text style={[s.error, { marginTop: 6 }]}>Missing receipt numbers — see leadership report.</Text> : null}
        </Card>
      ) : null}
      {data?.kind === 'monthly' ? (
        <Card>
          <KV k="Received this month" v={`$${data.monthly.received.total}`} />
          <KV k="Cash / Mobile money" v={`$${data.monthly.received.cash} / $${data.monthly.received.mobile}`} />
          <KV k={`Paid up for ${monthLabel(month)}`} v={`${data.monthly.coveredForMonth} of ${data.monthly.activeMembers} (${Math.round(data.monthly.collectionRate * 100)}%)`} />
          <KV k="Paid in advance" v={`$${data.monthly.advanceReceived}`} />
          <KV k="Arrears cleared" v={`$${data.monthly.arrearsCleared}`} />
          <KV k="Arrears outstanding" v={`$${data.monthly.totalArrears} (${data.monthly.arrears.length} members)`} />
          <KV k={`Year to date ${month.slice(0, 4)}`} v={`$${data.monthly.yearToDate.total}`} />
        </Card>
      ) : null}

      <Text style={s.label}>Who is the PDF for?</Text>
      <Segmented
        value={audience}
        onChange={setAudience}
        options={[
          { value: 'group', label: 'Youth group (totals)' },
          { value: 'leadership', label: 'Leadership (names)' },
        ]}
      />
      <Muted style={{ marginBottom: 12 }}>
        {audience === 'group'
          ? 'Totals only — no names. Safe to post in the youth WhatsApp group.'
          : 'Includes names of members in arrears, collectors and voided receipts. Send privately to leaders only.'}
      </Muted>
      <Btn label="Share PDF" onPress={share} busy={busy} disabled={!data} />
    </Screen>
  );
}
