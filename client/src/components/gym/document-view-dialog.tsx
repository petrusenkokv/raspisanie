import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Document } from "@shared/schema";

interface Props {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentViewDialog({ document, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document?.title}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
          {document?.content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
