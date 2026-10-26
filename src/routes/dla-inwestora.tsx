import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/dla-inwestora")({ beforeLoad: ({ location }) => { throw redirect({ to: "/", hash: location.hash, statusCode: 301 }); } });
