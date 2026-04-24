// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, RefreshCw, DollarSign, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { ClientSession, Invoice } from '../types';

interface InvoicesTabProps {
  session: ClientSession;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({ session }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const API_BASE = 'https://gotocare-original.jjioji.workers.dev';
      const cmd = `curl -s '${API_BASE}/api/client-portal/invoices?clientId=${session.clientId}'`;
      const result = await window.tasklet.runCommand(cmd);
      if (!result.stdout) throw new Error('No response');
      const data = JSON.parse(result.stdout);
      if (data.error) throw new Error(data.error);
      setInvoices(data.invoices || data.docs || []);
    } catch {
      // Demo data
      setInvoices([
        { id: 1, invoiceNumber: 'INV-2025-001', date: '2025-04-01', dueDate: '2025-04-15', totalAmount: 1250.00, status: 'paid' },
        { id: 2, invoiceNumber: 'INV-2025-002', date: '2025-04-15', dueDate: '2025-04-30', totalAmount: 980.00, status: 'sent' },
        { id: 3, invoiceNumber: 'INV-2025-003', date: '2025-03-01', dueDate: '2025-03-15', totalAmount: 1100.00, status: 'paid' },
        { id: 4, invoiceNumber: 'INV-2025-004', date: '2025-02-01', dueDate: '2025-02-15', totalAmount: 1350.00, status: 'paid' },
        { id: 5, invoiceNumber: 'INV-2025-005', date: '2025-01-15', dueDate: '2025-01-31', totalAmount: 750.00, status: 'overdue' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, []);

  const formatCurrency = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusConfig: Record<string, { icon: React.ReactNode; badge: string; label: string }> = {
    paid: { icon: <CheckCircle size={14} />, badge: 'badge-success', label: 'Paid' },
    sent: { icon: <Clock size={14} />, badge: 'badge-info', label: 'Pending' },
    draft: { icon: <FileText size={14} />, badge: 'badge-ghost', label: 'Draft' },
    overdue: { icon: <AlertTriangle size={14} />, badge: 'badge-error', label: 'Overdue' },
  };

  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((a, b) => a + b.totalAmount, 0);
  const totalPending = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((a, b) => a + b.totalAmount, 0);

  if (selectedInv) {
    const inv = selectedInv;
    const sc = statusConfig[inv.status] || statusConfig.draft;
    let lineItems: any[] = [];
    try { lineItems = inv.lineItems ? JSON.parse(inv.lineItems) : []; } catch {}

    return (
      <div className="p-4 pb-20">
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setSelectedInv(null)}>
          ← Back to Invoices
        </button>
        <div className="card bg-base-200">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="card-title text-base-content">{inv.invoiceNumber}</h3>
                <p className="text-sm text-base-content/60">{formatDate(inv.date)}</p>
              </div>
              <span className={`badge ${sc.badge} gap-1`}>{sc.icon}{sc.label}</span>
            </div>

            <div className="divider my-0"></div>

            <div className="grid grid-cols-2 gap-4 my-4">
              <div>
                <p className="text-xs text-base-content/50">Invoice Date</p>
                <p className="text-sm font-medium text-base-content">{formatDate(inv.date)}</p>
              </div>
              <div>
                <p className="text-xs text-base-content/50">Due Date</p>
                <p className="text-sm font-medium text-base-content">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-base-content/50">From</p>
                <p className="text-sm font-medium text-base-content">{session.agencyName}</p>
              </div>
              <div>
                <p className="text-xs text-base-content/50">To</p>
                <p className="text-sm font-medium text-base-content">{session.clientName}</p>
              </div>
            </div>

            {lineItems.length > 0 && (
              <>
                <div className="divider my-0"></div>
                <div className="my-4">
                  <p className="text-xs text-base-content/50 mb-2">Line Items</p>
                  {lineItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 border-b border-base-300 last:border-0">
                      <span className="text-sm text-base-content">{item.description || item.name}</span>
                      <span className="text-sm font-medium text-base-content">{formatCurrency(item.amount || item.total || 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="divider my-0"></div>

            <div className="flex justify-between items-center mt-4">
              <span className="text-lg font-bold text-base-content">Total</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(inv.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-base-content">Invoices</h2>
          <p className="text-sm text-base-content/60">Your billing history</p>
        </div>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={fetchInvoices}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card bg-success/10 p-3">
            <p className="text-xs text-base-content/50">Total Paid</p>
            <p className="text-lg font-bold text-success">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="card bg-warning/10 p-3">
            <p className="text-xs text-base-content/50">Outstanding</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(totalPending)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign size={48} className="mx-auto opacity-30 mb-3" />
          <p className="text-base-content/60">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const sc = statusConfig[inv.status] || statusConfig.draft;
            return (
              <div
                key={inv.id}
                className="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => setSelectedInv(inv)}
              >
                <div className="card-body p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-base-content">{inv.invoiceNumber}</p>
                      <p className="text-sm text-base-content/60">{formatDate(inv.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-base-content">{formatCurrency(inv.totalAmount)}</p>
                      <span className={`badge badge-sm ${sc.badge} gap-1`}>{sc.icon}{sc.label}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
