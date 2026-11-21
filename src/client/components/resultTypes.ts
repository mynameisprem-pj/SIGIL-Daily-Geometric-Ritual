export interface NextActionConfig {
  readonly label: string;
  readonly sublabel: string;
  readonly onTrigger: () => void;
}