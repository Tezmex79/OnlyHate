import { useCallback, useEffect, useState } from 'react';
import type { ReportItem } from '../types';
import { dismissReport, fetchReports, setCommentHidden, setPostHidden } from '../api';

type ModerationViewProps = {
  onStatusChange: (status: string) => void;
};

function ModerationView({ onStatusChange }: ModerationViewProps) {
  const [reports, setReports] = useState<ReportItem[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const { reports: items } = await fetchReports();
      setReports(items);
    } catch {
      onStatusChange('File de signalements inaccessible.');
    }
  }, [onStatusChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      onStatusChange(message);
      await reload();
    } catch {
      onStatusChange('Action impossible.');
    }
  };

  if (reports === null) {
    return <p className="empty-state">Chargement de la file...</p>;
  }

  return (
    <section className="page-card">
      <p className="eyebrow">Espace modération</p>
      <h1 className="page-title">Signalements ouverts ({reports.length})</h1>

      {reports.length === 0 ? (
        <p className="empty-state">Aucun signalement ouvert. La salle sagesse.</p>
      ) : (
        <ul className="report-list">
          {reports.map((report) => (
            <li key={report.id} className="report-card">
              <div className="report-head">
                <span className="badge badge-admin">{report.reason}</span>
                <span>
                  signalé par {report.reporter}
                </span>
              </div>

              {report.post && (
                <div className="report-target">
                  <p>
                    <strong>Post de {report.post.author}</strong>
                    {report.post.hidden ? ' (masqué)' : ''}
                  </p>
                  <p>{report.post.title}</p>
                  <p className="report-body">{report.post.body}</p>
                  <div className="report-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        void act(
                          () => setPostHidden(report.post!.id, !report.post!.hidden),
                          report.post!.hidden ? 'Post réaffiché.' : 'Post masqué.',
                        )
                      }
                    >
                      {report.post.hidden ? 'Réafficher' : 'Masquer le post'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void act(() => dismissReport(report.id), 'Signalement écarté.')}
                    >
                      Écarter le signalement
                    </button>
                  </div>
                </div>
              )}

              {report.comment && (
                <div className="report-target">
                  <p>
                    <strong>Vanne de {report.comment.author}</strong> sur « {report.comment.postTitle} »
                    {report.comment.hidden ? ' (masquée)' : ''}
                  </p>
                  <p className="report-body">{report.comment.body}</p>
                  <div className="report-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        void act(
                          () => setCommentHidden(report.comment!.id, !report.comment!.hidden),
                          report.comment!.hidden ? 'Vanne réaffichée.' : 'Vanne masquée.',
                        )
                      }
                    >
                      {report.comment.hidden ? 'Réafficher' : 'Masquer la vanne'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void act(() => dismissReport(report.id), 'Signalement écarté.')}
                    >
                      Écarter le signalement
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ModerationView;
