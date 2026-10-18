import { useTranslation } from "react-i18next";
import Modal, { ModalActions } from "./Modal";
import { buttonDanger } from "./controls";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Are you sure?" dialog guarding a destructive action. */
export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      titleId="confirm-dialog-title"
      className="max-w-sm"
      role="alertdialog"
      hideClose
    >
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <ModalActions
        onCancel={onCancel}
        onSubmit={onConfirm}
        submitLabel={confirmLabel ?? t("common.confirm")}
        submitClassName={buttonDanger}
      />
    </Modal>
  );
}
