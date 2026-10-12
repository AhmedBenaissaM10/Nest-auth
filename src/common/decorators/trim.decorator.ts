import { Transform, TransformOptions } from 'class-transformer';

export function Trim(options?: TransformOptions) {
  return Transform(
    ({ value }) => (typeof value === 'string' ? value.trim() : value),
    options,
  );
}
