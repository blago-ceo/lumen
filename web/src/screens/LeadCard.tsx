import { motion } from 'framer-motion';
import type { Lead } from '../lib/api';
import { haptic } from '../lib/tg';
import { PLATFORM_META, ago, cx } from '../lib/util';
import { spring } from '../components/ui';
import { Icon } from '../components/Icon';

export function PlatformTag({ lead }: { lead: Pick<Lead, 'platform' | 'source' | 'personal'> }) {
  const m = PLATFORM_META[lead.platform];
  return (
    <span className="pf">
      <span className="pf-glyph" style={{ background: m.color }}>{m.glyph}</span>
      {m.name}
      {lead.platform === 'telegram' && lead.source && <span className="faint">· {lead.source}</span>}
    </span>
  );
}

export function LeadCard({ lead, onOpen, locked }: { lead: Lead; onOpen?: () => void; locked?: boolean }) {
  return (
    <motion.article
      className={cx('lead glass', !lead.seen && !locked && 'unseen')}
      whileTap={{ scale: 0.985 }}
      transition={spring}
      onClick={() => {
        if (locked) return;
        haptic.tap();
        onOpen?.();
      }}
    >
      <div className="row" style={{ gap: 8 }}>
        <PlatformTag lead={lead} />
        <div className="spacer" />
        {lead.inResponses && <Icon name="bolt" size={15} />}
        {lead.saved && <Icon name="bookmark" size={15} className="faint" />}
        {lead.personal && <span className="badge badge-soft">мой чат</span>}
        {lead.isLanding && <span className="badge badge-accent">Лендинг</span>}
      </div>
      <h3 className="lead-title">{lead.title}</h3>
      <p className="lead-desc">{lead.description}</p>
      <div className="lead-foot">
        {lead.budgetText ? <span className="budget">{lead.budgetText}</span> : <span className="small faint">Бюджет не указан</span>}
        <div className="spacer" />
        <span className="tiny faint">{ago(lead.publishedAt)}</span>
      </div>
    </motion.article>
  );
}
