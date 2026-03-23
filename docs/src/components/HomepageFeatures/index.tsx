import clsx from "clsx";
import Heading from "@theme/Heading";
import Link from "@docusaurus/Link";
import styles from "./styles.module.css";
import { JSX } from "react";

type DocSection = {
  title: string;
  link: string;
  description: JSX.Element;
};

const DocSections: DocSection[] = [
  {
    title: "Введение",
    link: "/docs/intro",
    description: (
      <>Что такое b4, как работает обход блокировок и что нужно для старта.</>
    ),
  },
  {
    title: "Установка",
    link: "/docs/install/",
    description: (
      <>
        Установка на Linux, OpenWRT, ASUS Merlin, Keenetic, MikroTik и Docker.
      </>
    ),
  },
  {
    title: "Быстрый старт",
    link: "/docs/quickstart",
    description: (
      <>
        От первого запуска до работающего обхода за 5 минут через веб-интерфейс.
      </>
    ),
  },
  {
    title: "Сеты",
    link: "/docs/sets/",
    description: (
      <>
        Наборы настроек обхода: цели, TCP/UDP стратегии, маршрутизация.
      </>
    ),
  },
];

function DocCard({ title, link, description }: DocSection) {
  return (
    <div className={clsx("col col--6")}>
      <div className={styles.docCard}>
        <Heading as="h3">
          <Link to={link}>{title}</Link>
        </Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Документация
        </Heading>
        <div className="row">
          {DocSections.map((props, idx) => (
            <DocCard key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
