import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ressources")({
  component: () => <Outlet />,
});
