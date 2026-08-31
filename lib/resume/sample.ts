import type { ResumeDoc } from "./schema";
import { DEFAULT_THEME } from "./defaults";

/**
 * Seed fixture — transcribed from the provided resume screenshot.
 * Doubles as template #1's reference content and as the fit engine's
 * dense-content stress case.
 */
export const SAMPLE_RESUME: ResumeDoc = {
  page: { size: "A4" },
  theme: structuredClone(DEFAULT_THEME),
  contact: {
    name: "Shishir Jha",
    email: "shishirjhaccr@gmail.com",
    phone: "+91-8770964854",
    location: "",
    links: [
      { id: "link-li", label: "LinkedIn", url: "https://linkedin.com/in/shishir-jha" },
      { id: "link-gh", label: "GitHub", url: "https://github.com/shishirjha" },
    ],
  },
  summary: "",
  sections: [
    {
      id: "sec-skills",
      type: "skills",
      title: "Skills",
      entries: [
        {
          id: "skills-1",
          heading: "",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: [
            "AWS, Docker, Kubernetes, Azure, Jenkins, GitHub Actions, Python, Django, Fast API, Javascript, Node.js, Grafana, Prometheus, Datadog, Generative AI, PostgreSQL, MySQL",
          ],
        },
      ],
    },
    {
      id: "sec-experience",
      type: "experience",
      title: "Experience",
      entries: [
        {
          id: "exp-1",
          heading: "Associate Lead Software Engineer - Cloud Practice",
          subheading: "Expleo",
          dateRange: "Jul 2024 – Present",
          location: "",
          bullets: [
            "**Polaris Monitoring & Alerting (Voltron):** Designed a production-grade observability system for an IoT ingestion platform. Built a Jenkins-driven pipeline to provision 24 CloudWatch alarms across ECS Fargate and RDS, reducing raw JSON dumps into actionable, formatted alerts via Lambda.",
            "**Cloud Infrastructure:** Extended IAM roles and permissions boundaries (VA-PB-Standard) to support automated provisioning from Jenkins ECS agents across multi-account environments (Dev/Int/Prod).",
            "Working on scaling the system, which takes the sensor data for power trading analytics from 20 min call cycle to 1 min call cycle.",
            "Working on calibrating the legacy Sensor system to three-dimensional data, which will give more information and better idea of the power flowing through stations",
            "**AI/LLM Migration:** Developed \"Setu,\" an in-house LLM platform achieving 80% accuracy in tool interconversion using RAG (ChromaDB) and agentic workflows.",
            "**Cloud Cost Optimization (Khoros):** Executed a massive cost-reduction initiative using Datadog and CloudFix. Saved hundreds of thousands of dollars by downsizing underutilized MSK, ECS, and OpenSearch clusters, migrating from Redis to Valkey, and transitioning to Graviton-based instances.",
            "**Centralized Pipeline Infrastructure (NETS Bank):** Architected a multi-account CI/CD infrastructure using AWS CodePipeline and Terraform. Implemented zero-trust constraints with STS assume-role policies and External ID validation to prevent \"confused deputy\" attacks.",
            "**Conversion Service (Porsche):** Enhanced Porsche's conversion service to manage petabyte-scale data, significantly improving performance and scalability.",
            "Transformed batch scripts from Wine to Python, streamlining complex logic implementation and increasing efficiency.",
            "Integrated five advanced products into the conversion service, surpassing legacy systems in speed and capability.",
          ],
        },
        {
          id: "exp-2",
          heading: "Senior Software Engineer",
          subheading: "To The New",
          dateRange: "May 2022 – Jun 2024",
          location: "",
          bullets: [],
        },
        {
          id: "exp-2a",
          heading: "CARIAD",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: [
            "Main role as Python Full Stack developer having ownership of python stack of the conversion service which is responsible of inter-conversion of several EV Data formats (MDF, TDMS, TTL, Parquet etc.)",
            "Developed a new service from scratch which the whole organization will use for security analysis and reporting.",
            "Reduced the size of docker containers of Python converters by 200% used for a conversion service of vehicular data there by decreasing the build time and performance significantly",
            "Implemented whole Python stack for a few converters (EV Vehicle Data) end to end ensuring new ways to do conversion which was used by other teams consuming the conversion service",
            "Implemented the migration of conversion service from Microsoft's Storage to In house new Storage Service from scratch",
            "Initiated and directed the refactor of code from python to golang for different parts of converter wrappers for security reason",
          ],
        },
        {
          id: "exp-2b",
          heading: "Hilti",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: [
            "Led the development and deployment of automation software which takes the Google Analytics data performs some transformations to determine the leads for that specific data.",
            "Wrote program for rules of transformation, cron jobs to run the script daily and led the setup of CI/CD pipeline to run these cron jobs and deployment",
          ],
        },
        {
          id: "exp-2c",
          heading: "Scripta Insights",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: [
            "Led as the Full Stack Software Consultant taking care of everything from development to deployment to maintenance of Scripta Control Centre Multi-tenant application (A Django + React full stack application)",
            "Led all integration levels and all major production deployments and releases.",
            "Built a whole new environment similar to prod required by the Java microservices team to mimic prod deployment and testing purposes.",
            "Built Data Ingestion System from the third-party formulary data provider from scratch allowing seamless data analysis and formulary data management across all 50+ tenants/customers of Scripta and built dashboard for it using React JS.",
            "Built an alert and Reporting System for the Reporting to find and alert discrepany on their monthly QC savings reports",
          ],
        },
        {
          id: "exp-3",
          heading: "Software Development Engineer",
          subheading: "Unirac",
          dateRange: "Apr 2020 – Apr 2022",
          location: "",
          bullets: [
            "Contributed to the development of two major products, enhancing functionality and user experience across platforms.",
            "Engineered three solar products end-to-end within Ubuilder using Django and React, improving deployment speed by 30%.",
            "Optimized layout report implementation, reducing report load times by 50% and enhancing user satisfaction.",
            "Automated SQL data dump generation and sanitization, enabling rapid debugging of project-specific issues in production.",
            "Implemented profiling systems to identify and optimize long-running processes, achieving performance improvements of up to 40%.",
            "Designed and built an Internal Performance Management System from scratch, streamlining organizational processes and improving efficiency.",
            "Directed the development of an action tracker module in the UNI System, enhancing project management capabilities across the organization.",
          ],
        },
        {
          id: "exp-4",
          heading: "Junior Technical Director",
          subheading: "DNEG",
          dateRange: "Feb 2018 – Apr 2020",
          location: "",
          bullets: [
            "Worked as Pipeline developer for 3d Compositing department (Converting movies from 2d to 3d)",
            "Built scripts for 3d compositing software which automates poly drawing and issues faced by different artists.",
            "Involved in many popular movie projects like Venom, Aquaman(DC), Padmavat etc to name a few.",
          ],
        },
      ],
    },
    {
      id: "sec-education",
      type: "education",
      title: "Education",
      entries: [
        {
          id: "edu-1",
          heading: "Amity University",
          subheading: "BE/B.Tech/Bs",
          dateRange: "",
          location: "",
          bullets: [],
        },
      ],
    },
  ],
};
