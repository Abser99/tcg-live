import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Política de Privacidad — TCG Live",
  description:
    "Aviso de Privacidad de TCG Live conforme a la LFPDPPP. Conoce cómo tratamos tus datos personales.",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-20">
        {/* Header */}
        <div className="mb-12">
          <p className="text-sm font-medium text-[#a78bfa] mb-3 uppercase tracking-widest">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-black mb-4">
            Política de Privacidad
          </h1>
          <p className="text-zinc-500 text-sm">
            Última actualización: 23 de junio de 2026
          </p>
        </div>

        <div
          className="rounded-2xl p-8 md:p-12 space-y-10"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {/* LFPDPPP notice */}
          <div
            className="rounded-xl px-5 py-4 text-sm text-[#a78bfa]"
            style={{ background: "rgba(108,58,232,0.1)", border: "1px solid rgba(108,58,232,0.2)" }}
          >
            Este Aviso de Privacidad se emite en cumplimiento de la{" "}
            <strong className="text-white">
              Ley Federal de Protección de Datos Personales en Posesión de los
              Particulares (LFPDPPP)
            </strong>{" "}
            y su Reglamento, vigentes en los Estados Unidos Mexicanos.
          </div>

          <Section title="1. Identidad y Domicilio del Responsable">
            <p>
              <strong className="text-white">TCG Live</strong> (en adelante "el
              Responsable") es la plataforma responsable del tratamiento de tus datos
              personales. Puedes contactarnos a través de:
            </p>
            <div
              className="mt-4 rounded-xl px-5 py-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-sm text-zinc-300">
                <span className="text-zinc-500">Correo electrónico:</span>{" "}
                <a
                  href="mailto:tcgsubastas@gmail.com"
                  className="text-[#a78bfa] hover:text-white transition-colors"
                >
                  tcgsubastas@gmail.com
                </a>
              </p>
              <p className="text-sm text-zinc-300 mt-1">
                <span className="text-zinc-500">País de operación:</span>{" "}
                Estados Unidos Mexicanos
              </p>
            </div>
          </Section>

          <Section title="2. Datos Personales que Recabamos">
            <p>
              Para brindarte nuestros servicios, recabamos las siguientes categorías de datos
              personales:
            </p>
            <div className="mt-4 space-y-3">
              <DataCategory
                label="Datos de identificación"
                items={["Nombre de usuario", "Dirección de correo electrónico"]}
              />
              <DataCategory
                label="Datos de contacto y envío"
                items={[
                  "Nombre completo (para envíos)",
                  "Dirección postal",
                  "Número de teléfono",
                ]}
              />
              <DataCategory
                label="Datos de actividad en la plataforma"
                items={[
                  "Historial de subastas y pujas",
                  "Historial de compras y ventas",
                  "Calificaciones y reseñas recibidas",
                  "Mensajes en chat de subastas",
                ]}
              />
              <DataCategory
                label="Datos técnicos"
                items={[
                  "Dirección IP",
                  "Tipo de dispositivo y navegador",
                  "Cookies de sesión y preferencias",
                  "Registros de acceso (logs)",
                ]}
              />
            </div>
            <p className="mt-4 text-xs text-zinc-600">
              No recabamos datos personales sensibles (origen racial, estado de salud,
              creencias religiosas, etc.) como parte de nuestros servicios.
            </p>
          </Section>

          <Section title="3. Finalidades del Tratamiento">
            <p>
              Tus datos personales son tratados para las siguientes finalidades:
            </p>
            <p className="mt-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Finalidades primarias (necesarias para el servicio)
            </p>
            <ul className="space-y-1.5 list-disc list-inside text-zinc-400 text-sm">
              <li>Crear y administrar tu cuenta de usuario.</li>
              <li>Procesar y gestionar subastas, pujas y transacciones.</li>
              <li>Facilitar el pago a través de Mercado Pago.</li>
              <li>Coordinar el envío de productos adquiridos.</li>
              <li>Gestionar disputas y reclamaciones.</li>
              <li>Cumplir con obligaciones legales y fiscales aplicables.</li>
            </ul>
            <p className="mt-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Finalidades secundarias (puedes oponerte)
            </p>
            <ul className="space-y-1.5 list-disc list-inside text-zinc-400 text-sm">
              <li>
                Enviarte notificaciones sobre subastas, ofertas y novedades de la plataforma.
              </li>
              <li>Realizar análisis estadísticos para mejorar la experiencia.</li>
              <li>Mostrarte contenido personalizado según tu historial de actividad.</li>
            </ul>
            <p className="mt-3 text-sm">
              Si no deseas que tus datos sean tratados para finalidades secundarias, envíanos
              un correo a{" "}
              <a
                href="mailto:tcgsubastas@gmail.com"
                className="text-[#a78bfa] hover:text-white transition-colors"
              >
                tcgsubastas@gmail.com
              </a>{" "}
              indicando tu solicitud.
            </p>
          </Section>

          <Section title="4. Transferencia de Datos Personales">
            <p>
              Para operar la plataforma, compartimos datos con los siguientes terceros
              encargados del tratamiento. Dichos terceros están obligados contractualmente a
              proteger tu información:
            </p>
            <div className="mt-4 space-y-3">
              <TransferRow
                name="Mercado Pago (Mercado Libre S. de R.L. de C.V.)"
                purpose="Procesamiento de pagos y gestión de fondos en custodia."
                country="México / Argentina"
              />
              <TransferRow
                name="LiveKit Inc."
                purpose="Infraestructura de streaming de video en tiempo real para subastas en vivo."
                country="Estados Unidos"
              />
              <TransferRow
                name="Cloudinary Inc."
                purpose="Almacenamiento y optimización de imágenes de productos."
                country="Estados Unidos"
              />
              <TransferRow
                name="Railway (Railway Corp.)"
                purpose="Hospedaje de la infraestructura de backend y base de datos."
                country="Estados Unidos"
              />
              <TransferRow
                name="Cloudflare Inc."
                purpose="Seguridad web, red de distribución de contenido y verificación anti-bot."
                country="Estados Unidos"
              />
            </div>
            <p className="mt-4 text-xs text-zinc-600">
              No vendemos ni cedemos tus datos personales a terceros con fines comerciales
              ajenos a la operación de TCG Live.
            </p>
          </Section>

          <Section title="5. Derechos ARCO">
            <p>
              En términos de la LFPDPPP, tienes derecho a:
            </p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <ARCOCard
                letter="A"
                title="Acceso"
                desc="Conocer qué datos personales tenemos sobre ti y para qué los utilizamos."
              />
              <ARCOCard
                letter="R"
                title="Rectificación"
                desc="Solicitar la corrección de tus datos cuando sean inexactos o incompletos."
              />
              <ARCOCard
                letter="C"
                title="Cancelación"
                desc="Pedir que eliminemos tus datos cuando ya no sean necesarios o cuando retires tu consentimiento."
              />
              <ARCOCard
                letter="O"
                title="Oposición"
                desc="Oponerte al tratamiento de tus datos para finalidades secundarias específicas."
              />
            </div>
            <p className="mt-4 text-sm">
              Para ejercer tus derechos ARCO, envía un correo a{" "}
              <a
                href="mailto:tcgsubastas@gmail.com"
                className="text-[#a78bfa] hover:text-white transition-colors"
              >
                tcgsubastas@gmail.com
              </a>{" "}
              con el asunto <strong className="text-white">"Derechos ARCO"</strong> indicando:
              tu nombre, correo de registro, el derecho que deseas ejercer y los datos
              correspondientes. Responderemos dentro de los{" "}
              <strong className="text-white">20 días hábiles</strong> siguientes.
            </p>
          </Section>

          <Section title="6. Cookies y Tecnologías de Seguimiento">
            <p>
              TCG Live usa cookies y tecnologías similares para:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-400 text-sm">
              <li>Mantener tu sesión activa de forma segura.</li>
              <li>Recordar tus preferencias de idioma y tema.</li>
              <li>Analizar el uso de la plataforma con herramientas de analítica (PostHog).</li>
            </ul>
            <p className="mt-3">
              Puedes configurar tu navegador para rechazar cookies. Ten en cuenta que esto puede
              afectar la funcionalidad de la plataforma. Nuestra herramienta de analítica opera
              con anonimización de IP activada.
            </p>
          </Section>

          <Section title="7. Medidas de Seguridad">
            <p>
              Implementamos medidas técnicas y organizativas para proteger tus datos:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-400 text-sm">
              <li>Transmisión cifrada mediante HTTPS/TLS en todas las comunicaciones.</li>
              <li>Contraseñas almacenadas con hash bcrypt, nunca en texto plano.</li>
              <li>Acceso restringido a datos personales solo para personal autorizado.</li>
              <li>Tokens de sesión con expiración y rotación automática.</li>
            </ul>
          </Section>

          <Section title="8. Conservación de Datos">
            <p>
              Conservamos tus datos personales durante el tiempo que tu cuenta esté activa y
              por el periodo mínimo requerido por la legislación fiscal y comercial mexicana
              aplicable (generalmente 5 años para registros de transacciones). Al solicitar la
              cancelación de tu cuenta, eliminaremos o anonimizaremos tus datos en un plazo
              máximo de <strong className="text-white">30 días hábiles</strong>, salvo
              obligación legal de conservación.
            </p>
          </Section>

          <Section title="9. Cambios a este Aviso de Privacidad">
            <p>
              Podemos modificar este Aviso de Privacidad en cualquier momento para reflejar
              cambios en la legislación, en nuestras prácticas o en los servicios. Las
              modificaciones sustanciales se comunicarán con al menos{" "}
              <strong className="text-white">15 días de anticipación</strong> mediante correo
              electrónico a la dirección de registro.
            </p>
            <p className="mt-3">
              Te recomendamos revisar periódicamente esta página. El uso continuo de la
              plataforma después de la fecha de vigencia de los cambios implica la aceptación
              del aviso actualizado.
            </p>
          </Section>

          <Section title="10. Contacto y Autoridad">
            <p>
              Para cualquier consulta sobre el tratamiento de tus datos personales o para
              ejercer tus derechos ARCO:
            </p>
            <div
              className="mt-4 rounded-xl px-5 py-4 flex items-center gap-3"
              style={{ background: "rgba(108,58,232,0.08)", border: "1px solid rgba(108,58,232,0.18)" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: "rgba(108,58,232,0.2)" }}
              >
                ✉
              </div>
              <a
                href="mailto:tcgsubastas@gmail.com"
                className="text-[#a78bfa] hover:text-white transition-colors font-medium text-sm"
              >
                tcgsubastas@gmail.com
              </a>
            </div>
            <p className="mt-4 text-sm">
              Si consideras que tu derecho a la protección de datos ha sido vulnerado, puedes
              acudir al Instituto Nacional de Transparencia, Acceso a la Información y
              Protección de Datos Personales (INAI):{" "}
              <a
                href="https://www.inai.org.mx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a78bfa] hover:text-white transition-colors"
              >
                www.inai.org.mx
              </a>
            </p>
          </Section>
        </div>

        {/* Footer nav */}
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-600">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            ← Inicio
          </Link>
          <Link href="/terminos" className="hover:text-zinc-300 transition-colors">
            Términos de Servicio
          </Link>
          <a href="mailto:tcgsubastas@gmail.com" className="hover:text-zinc-300 transition-colors">
            Contacto
          </a>
        </div>
      </main>
    </div>
  );
}

/* ---- Sub-components ---- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="text-lg font-bold text-white mb-3 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {title}
      </h2>
      <div className="text-zinc-400 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function DataCategory({ label, items }: { label: string; items: string[] }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-xs font-semibold text-zinc-400 mb-1.5">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-xs text-zinc-500 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#6C3AE8] flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransferRow({
  name,
  purpose,
  country,
}: {
  name: string;
  purpose: string;
  country: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-sm font-semibold text-zinc-300 mb-1">{name}</p>
      <p className="text-xs text-zinc-500">{purpose}</p>
      <p className="text-xs text-zinc-600 mt-1">Pais: {country}</p>
    </div>
  );
}

function ARCOCard({
  letter,
  title,
  desc,
}: {
  letter: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-4 flex gap-3"
      style={{ background: "rgba(108,58,232,0.06)", border: "1px solid rgba(108,58,232,0.15)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 text-white"
        style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
      >
        {letter}
      </div>
      <div>
        <p className="text-sm font-bold text-white mb-0.5">{title}</p>
        <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
