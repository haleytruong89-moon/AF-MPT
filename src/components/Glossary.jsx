// Body of the Glossary modal (App.jsx wraps it in <Modal>). Term bold, English line, Vietnamese line muted.
import { GLOSSARY } from '../glossary';

export function GlossaryList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
      {GLOSSARY.map((g) => (
        <div key={g.term}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{g.term}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{g.en}</div>
          <div style={{ fontSize: 12.5, marginTop: 2, color: '#6E6C66' }}>{g.vi}</div>
        </div>
      ))}
    </div>
  );
}
