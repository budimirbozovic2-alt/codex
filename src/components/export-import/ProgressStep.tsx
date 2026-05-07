import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  progress: number;
  message: string;
}

export function ProgressStep({ progress, message }: Props) {
  return (
    <div className="py-8 space-y-4">
      <div className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-center text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
