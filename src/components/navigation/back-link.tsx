import Link from "next/link";
import { returnLabelForPath } from "@/lib/navigation/return-to";
import { Button } from "@/components/ui/button";

type Props = {
  href: string;
  label?: string;
};

export function BackLink({ href, label }: Props) {
  return (
    <Button asChild variant="outline">
      <Link href={href}>{label ?? returnLabelForPath(href)}</Link>
    </Button>
  );
}
