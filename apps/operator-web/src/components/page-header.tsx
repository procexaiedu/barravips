type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <p className="eyebrow">Operação</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
