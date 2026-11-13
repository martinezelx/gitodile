# 213 — Conformidad con el estilo existente

Revisión de código y capturas históricas, 2026-10-31. No es una nueva
comprobación visual en Tauri. Backend fuera de alcance.

Esta matriz conserva el diagnóstico previo a la implementación. El mantenedor
aprobó después aplicar la propuesta a la pantalla principal; las correcciones
efectuadas y su evidencia actual están en
[la tarea y su validación](../../0.5.1/213-frontend-flow-and-visual-review.md#validation).

## Criterio de aceptación

La mejora debe parecer una parte de la app existente al 100%: mismo material,
estructura, tipografía, espaciado, controles, iconos y estados del equivalente
más próximo. No basta con compartir colores o radios. No se propone un tema,
token, anchura, sombra ni patrón nuevo. La igualdad de valores de CSS no prueba
por sí sola la igualdad perceptiva: falta comparación en ejecución.

## Comparación por superficie

| Superficie nueva | Equivalente existente y fuente | Resultado de inspección | Ajuste permitido / comprobación pendiente |
| --- | --- | --- | --- |
| Resolvedor: estructura | Trabajo/Cambios e Historial: `changes.css` `.changes-layout`, `history.css` `.history-layout` | Comparte `--panel-column`, separación cero y regiones sobre la hoja. `conflicts.css` mantiene material opaco y divisores. | Conservar estructura. Comparar borde de columna, alturas, márgenes, scroll y versión compacta lado a lado. No añadir tarjetas ni un asistente de pasos permanente. |
| Resolvedor: franja de detalle | Cambios: contrato de altura de sus franjas en `.changes-layout` y toolbars | Diferencia de código: `.conflicts-detail__header` usa `min-height: var(--strip-height)` con padding vertical; `.conflicts-list__toolbar` usa `height`, y Cambios documenta altura fija y `flex: 0 0 auto` para alinear. | Candidato a corrección: reutilizar el contrato común sin recortar nombre/descripción. Verificar altura computada y texto con zoom; no afirmar desalineación observada sin captura nueva. |
| Resolvedor: filas | Cambios: filas de archivos y directorio secundario | Ya usa `--radius-item`, estados de superficie, escalas de texto y símbolos de estado. Las alturas de virtualización son específicas del contenido. | Mantener jerarquía nombre/carpeta/estado y selección. No igualar alturas por fuerza ni comprometer virtualización. Comparar densidad real y foco. |
| Acciones por archivo | Barra de Cambios y confirmación en línea de recuperación | Botones compartidos pequeños, estado a la izquierda, acciones a la derecha, confirmación que reemplaza la barra. Ya tiene estado elegido y sin resolver. | Afinar mensaje usando el espacio existente si hace falta. Retirar la sugerencia inicial de mover botones dentro de cada panel: inventaría una organización distinta. No añadir otra tarjeta de progreso. |
| Traer una rama / Obtener cambios | Publicar / Guardar: `PublishDialog.tsx`, `SaveVersionDialog.tsx`; `Dialog.tsx` y `primitives.css` | Usan `Dialog size="m"`, hechos, avisos y acciones compartidas. Compartir shell no elimina diferencias internas. | Mantener cabecera, glifo, inset, tamaño y pie del shell. Mejorar orden/contenido dentro de DialogFacts; no usar títulos gigantes, cápsulas de ramas nuevas ni stepper. |
| Listas de impacto Bring/Get | Get: `sync.css` `.get-team-overlaps`; listas de Publicar: `publish.css` | Diferencia comprobable de composición: Bring representa evidencias como texto plano de una línea en `VirtualRows`; Get ofrece icono/ruta/subtexto sobre superficie de control para solapamientos y otra receta para versiones. | Unificar receta según el papel de la lista, manteniendo virtualización y límites. Comparar rutas largas, iconos, metadatos, espacio y estado vacío. No decorar todas las listas con tarjetas. |
| Terminar: formulario y éxito | Guardar versión y su resultado: `SaveVersionDialog.tsx` | Formulario `m/local`, resultado `m/success` y pie secundario/primario siguen el precedente de Guardar, que conserva `m` también en éxito. | Conservar coherencia con Guardar. DESIGN describe resultados breves en `s`, pero no estrechar solo este diálogo: evaluar el patrón compartido y documentar cualquier cambio conjunto. |
| Restablecer / Abandonar | Descartar: `DiscardChangesDialog.tsx` | `s/danger`, DialogFacts, avisos y botones compartidos coinciden con confirmaciones de pérdida de trabajo. | Conservar shell y jerarquía. Explicar alcances diferentes con hechos existentes, sin un nuevo tipo de modal ni nueva paleta de advertencia. |
| Avisos, errores y vacíos | Avisos de Cambios/Historial; DialogBanner; empty-state de shared/ui | El resolvedor usa un aviso específico que reproduce la receta de Cambios; errores de diálogo usan DialogBanner y vacíos reutilizan empty-state. | Comparar tamaño de icono, contorno por severidad, texto, CTA y posición. No sustituir un aviso de pantalla por un banner de diálogo por simple unificación nominal. |
| Avatar y Markdown | Resumen, barra de estado y galería; tarea 212 | Son decisiones ya aprobadas: avatar de 26 px y barras/tintes con eliminación discontinua. | Verificar integración y accesibilidad; no rediseñarlos ni imponer el tamaño de otro avatar, cuyo papel es distinto. |

## Reglas para todas las propuestas del HTML

- Cada propuesta nombra su equivalente y el componente, clase o token que
  reutiliza. Si no existe un equivalente, se registra como decisión pendiente,
  no se introduce una excepción local.
- Conservar `SearchBox`, `RefreshIconButton`, `Dialog`, `DialogFacts`,
  `DialogBanner`, placeholders, botones y menús existentes sin restilizarlos.
- Conservar `--panel-column`, `--strip-height`, superficies semánticas,
  escalas de texto/peso/leading, espacios, radios por rol e iconos Lucide.
- Las mejoras de claridad se hacen primero en el mensaje, la agrupación y el
  estado ya existentes; no se agregan contenedores, indicadores o CTAs por
  defecto. Cualquier acción nueva requiere justificar su necesidad.
- Los bocetos genéricos anteriores no eran una reproducción fiel. Se retiran
  del HTML y se sustituyen por referencias de implementación. El diseño del
  propio informe no es un patrón propuesto para la aplicación.

## Validación necesaria para declarar conformidad visual

Capturas nuevas de cada superficie y su equivalente con el mismo tema, idioma,
viewport y escala. Comparar claro y oscuro, inglés/español, normal y 200%,
ventana estrecha/baja, teclado, foco y movimiento reducido. Registrar diferencias
en geometría, material, lectura y estados; resolverlas antes de marcar el criterio
de coherencia como completo. No se declara «100% validado» con esta inspección.

Fuentes: [DESIGN.md](../../../DESIGN.md),
[tarea 213](../../0.5.1/213-frontend-flow-and-visual-review.md).
Los HTML fueron prototipos temporales, retirados por petición del mantenedor.
Esta matriz no cambia código de producto.
