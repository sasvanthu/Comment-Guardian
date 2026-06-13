import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { dataStagger, dataItem } from "@/lib/motion";

type DivProps = HTMLMotionProps<"div">;

/**
 * Wraps a list/grid in a coordinated stagger context.
 * Children using <DataItem> mount with a 30ms cascade.
 */
export const DataStagger = forwardRef<HTMLDivElement, DivProps>(function DataStagger(
  { children, ...props },
  ref,
) {
  return (
    <motion.div ref={ref} variants={dataStagger} initial="hidden" animate="show" {...props}>
      {children}
    </motion.div>
  );
});

export const DataItem = forwardRef<HTMLDivElement, DivProps>(function DataItem(
  { children, ...props },
  ref,
) {
  return (
    <motion.div ref={ref} variants={dataItem} {...props}>
      {children}
    </motion.div>
  );
});
