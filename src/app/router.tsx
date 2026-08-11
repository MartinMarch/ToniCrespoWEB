import { createBrowserRouter } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { BiographyPage } from "../pages/BiographyPage";
import { CollectionDetailPage } from "../pages/CollectionDetailPage";
import { HomePage } from "../pages/HomePage";
import { NewsPage } from "../pages/NewsPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PhotographyPage } from "../pages/PhotographyPage";
import { SupportCollectionDetailPage } from "../pages/SupportCollectionDetailPage";
import { SupportPage } from "../pages/SupportPage";
import { WorksPage } from "../pages/WorksPage";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/obra",
        element: <WorksPage />,
      },
      {
        path: "/lienzos",
        element: <SupportPage kind="canvas" />,
      },
      {
        path: "/lienzos/:collectionSlug",
        element: <SupportCollectionDetailPage kind="canvas" />,
      },
      {
        path: "/laminas",
        element: <SupportPage kind="paper" />,
      },
      {
        path: "/laminas/:collectionSlug",
        element: <SupportCollectionDetailPage kind="paper" />,
      },
      {
        path: "/obra/:collectionSlug",
        element: <CollectionDetailPage />,
      },
      {
        path: "/fotografia",
        element: <PhotographyPage />,
      },
      {
        path: "/noticias",
        element: <NewsPage />,
      },
      {
        path: "/noticias-2",
        element: <NewsPage />,
      },
      {
        path: "/trayectoria",
        element: <BiographyPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
], { basename });
