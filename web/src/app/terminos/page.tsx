import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Términos de Servicio — TCG Live",
  description:
    "Términos y condiciones de uso de la plataforma TCG Live. Subastas en vivo de cartas coleccionables en México.",
};

export default function TerminosPage() {
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
            Términos de Servicio
          </h1>
          <p className="text-zinc-500 text-sm">
            Última actualización: 23 de junio de 2026
          </p>
        </div>

        <div
          className="rounded-2xl p-8 md:p-12 space-y-10"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {/* Intro */}
          <div className="rounded-xl px-5 py-4 text-sm text-[#a78bfa]"
            style={{ background: "rgba(108,58,232,0.1)", border: "1px solid rgba(108,58,232,0.2)" }}>
            Al acceder o usar la plataforma TCG Live, aceptas quedar vinculado por
            estos Términos de Servicio. Si no estás de acuerdo con alguno de los
            términos aquí establecidos, no uses el servicio.
          </div>

          <Section title="1. Descripción del Servicio">
            <p>
              TCG Live es una plataforma de subastas en vivo de productos de juegos de cartas
              coleccionables (TCG) operada en la República Mexicana. Permite a usuarios
              registrados publicar productos, participar en subastas en tiempo real mediante
              transmisiones de video, y concretar transacciones de compraventa de manera segura.
            </p>
            <p className="mt-3">
              TCG Live actúa como intermediario tecnológico entre vendedores y compradores.
              La plataforma no compra, vende, ni posee los productos listados. Las
              obligaciones de entrega y pago recaen sobre los usuarios participantes.
            </p>
          </Section>

          <Section title="2. Registro de Usuarios">
            <ul className="space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>
                Debes tener al menos 18 años de edad o contar con la autorización de un tutor
                legal para usar la plataforma.
              </li>
              <li>
                Al registrarte proporcionas información veraz, actualizada y completa. Eres
                responsable de mantener la confidencialidad de tu contraseña.
              </li>
              <li>
                Cada usuario puede tener una sola cuenta activa. El uso de cuentas múltiples
                para manipular subastas está prohibido y puede resultar en la suspensión
                permanente.
              </li>
              <li>
                TCG Live se reserva el derecho de suspender o cancelar cuentas que violen
                estos términos o que representen un riesgo para la comunidad.
              </li>
            </ul>
          </Section>

          <Section title="3. Subastas y Pujas">
            <p>
              Al participar en una subasta, el postor acepta los siguientes lineamientos:
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>
                Una puja realizada es una oferta vinculante. No puedes retractarte de una
                puja una vez enviada.
              </li>
              <li>
                El usuario con la puja más alta al cierre de la subasta está obligado a
                completar la compra dentro de las 48 horas siguientes.
              </li>
              <li>
                Las subastas tienen precios base y duración fijados por el vendedor. TCG Live
                puede retirar o pausar subastas que violen las políticas de la plataforma.
              </li>
              <li>
                El sistema de pujas es automatizado. En caso de empate técnico, la primera
                puja registrada en el servidor tiene precedencia.
              </li>
              <li>
                Está prohibido el uso de bots, scripts o cualquier medio automatizado para
                pujar. Las cuentas involucradas serán suspendidas permanentemente.
              </li>
            </ul>
          </Section>

          <Section title="4. Pagos y Comisiones">
            <p>
              TCG Live cobra una comisión del <strong className="text-white">8%</strong> sobre
              el precio final de venta a cargo del vendedor. Esta comisión cubre el procesamiento
              del pago, el uso de la infraestructura de streaming y el servicio de protección al
              comprador.
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>
                Los pagos se procesan a través de Mercado Pago. Al comprar, aceptas también
                los términos y condiciones de Mercado Pago.
              </li>
              <li>
                Los fondos del comprador quedan retenidos en custodia hasta que el vendedor
                acredite el envío o el comprador confirme la recepción del producto.
              </li>
              <li>
                Los precios se expresan en Pesos Mexicanos (MXN). TCG Live no es responsable
                por fluctuaciones cambiarias en pagos internacionales.
              </li>
              <li>
                El reembolso al comprador procede en caso de: producto no enviado en 10 días
                hábiles, producto que no corresponde a lo descrito, o producto con daño no
                declarado.
              </li>
            </ul>
          </Section>

          <Section title="5. Envíos y Disputas">
            <p>
              El vendedor es responsable de empacar y enviar el producto de forma segura dentro
              de los <strong className="text-white">5 días hábiles</strong> posteriores al
              cierre de la subasta. Debe proporcionar número de guía de envío en la plataforma.
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>
                El costo del envío es acordado entre las partes o indicado en la subasta. TCG
                Live no asume costos de mensajería salvo en disputas resueltas a favor del
                comprador por error del vendedor.
              </li>
              <li>
                En caso de disputa, el comprador debe abrir un reporte dentro de los{" "}
                <strong className="text-white">3 días hábiles</strong> siguientes a recibir el
                producto. Pasado ese plazo, la transacción se considera aceptada.
              </li>
              <li>
                TCG Live actuará como árbitro en disputas, solicitando evidencia fotográfica y
                la comunicación entre las partes. La resolución de TCG Live es definitiva.
              </li>
              <li>
                Las disputas fraudulentas o de mala fe pueden resultar en la suspensión de la
                cuenta del comprador o vendedor.
              </li>
            </ul>
          </Section>

          <Section title="6. Conducta Prohibida">
            <p>Está estrictamente prohibido en TCG Live:</p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>Listar productos falsificados, robados o de venta ilegal.</li>
              <li>Manipular precios mediante pujas coordinadas con terceros (shill bidding).</li>
              <li>Acosar, insultar o amenazar a otros usuarios en el chat de subastas.</li>
              <li>Publicar contenido adulto, violento u ofensivo en transmisiones o listados.</li>
              <li>Evadir comisiones realizando transacciones fuera de la plataforma acordadas
                dentro de ella.</li>
              <li>Suplantar la identidad de otros usuarios, celebridades o de TCG Live.</li>
              <li>Intentar acceder sin autorización a sistemas o cuentas de la plataforma.</li>
            </ul>
            <p className="mt-3">
              Las violaciones pueden resultar en suspensión temporal, suspensión permanente,
              reporte a autoridades competentes o acciones legales.
            </p>
          </Section>

          <Section title="7. Limitación de Responsabilidad">
            <p>
              TCG Live proporciona la plataforma "tal cual" y en la medida permitida por la
              legislación mexicana aplicable:
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-zinc-400 text-sm leading-relaxed">
              <li>
                No garantizamos la disponibilidad ininterrumpida del servicio. Realizaremos
                mantenimientos programados con aviso previo.
              </li>
              <li>
                No somos responsables por pérdidas derivadas de interrupciones del servicio,
                errores técnicos o acciones de terceros (incluidos proveedores de pago y
                mensajería).
              </li>
              <li>
                No verificamos de forma exhaustiva la autenticidad de cada producto. Sin
                embargo, contamos con mecanismos de reporte y sanción para transacciones
                fraudulentas.
              </li>
              <li>
                Nuestra responsabilidad máxima ante cualquier reclamación no excederá el
                monto de la comisión cobrada en la transacción objeto de la disputa.
              </li>
            </ul>
          </Section>

          <Section title="8. Propiedad Intelectual">
            <p>
              El nombre "TCG Live", el logotipo, el diseño de la plataforma y el código fuente
              son propiedad exclusiva de sus titulares. Queda prohibida su reproducción total o
              parcial sin autorización escrita.
            </p>
            <p className="mt-3">
              Los usuarios conservan los derechos sobre el contenido que publican (fotos,
              videos, descripciones) y otorgan a TCG Live una licencia no exclusiva, gratuita y
              mundial para mostrarlo en la plataforma con fines operativos.
            </p>
          </Section>

          <Section title="9. Modificaciones al Servicio y a los Términos">
            <p>
              TCG Live puede modificar estos Términos en cualquier momento. Las modificaciones
              se notificarán con al menos <strong className="text-white">15 días de anticipación</strong>{" "}
              mediante correo electrónico o aviso destacado en la plataforma. El uso continuado
              del servicio tras la fecha de entrada en vigor implica la aceptación de los nuevos
              términos.
            </p>
          </Section>

          <Section title="10. Ley Aplicable y Jurisdicción">
            <p>
              Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos, incluyendo
              el Código de Comercio, la Ley Federal de Protección al Consumidor (PROFECO), y la
              Ley Federal de Protección de Datos Personales en Posesión de los Particulares
              (LFPDPPP).
            </p>
            <p className="mt-3">
              Para cualquier controversia derivada de estos Términos, las partes se someten a
              la jurisdicción de los tribunales competentes de la Ciudad de México, renunciando
              expresamente a cualquier otro fuero que pudiera corresponderles.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>
              Para preguntas, reportes o aclaraciones sobre estos Términos de Servicio, contáctanos
              en:
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
          </Section>
        </div>

        {/* Footer nav */}
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-600">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            ← Inicio
          </Link>
          <Link href="/privacidad" className="hover:text-zinc-300 transition-colors">
            Política de Privacidad
          </Link>
          <a href="mailto:tcgsubastas@gmail.com" className="hover:text-zinc-300 transition-colors">
            Contacto
          </a>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {title}
      </h2>
      <div className="text-zinc-400 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
