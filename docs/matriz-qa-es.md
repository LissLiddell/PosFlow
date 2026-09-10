# Matriz de QA de PosFlow

Esta matriz distingue el efectivo físico de los saldos de control. Un movimiento
puede liquidar una responsabilidad sin meter dinero al cajón, y una fajilla puede
sacar dinero del cajón sin reducir el efectivo total bajo custodia.

## Impacto de cada evento

| Evento | Cajón | Custodia | Inventario | Fondeo | Anticipo pendiente |
| --- | ---: | ---: | ---: | ---: | ---: |
| Autorizar anticipo | 0 | 0 | 0 | 0 | 0 hasta entregarlo |
| Apertura | + fondo | 0 | 0 | 0 | 0 |
| Venta en efectivo | + total vendido | 0 | − unidades | 0 | 0 |
| Crear fajilla borrador | 0 | 0 | 0 | 0 | 0 |
| Sellar fajilla | − fajilla | + fajilla | 0 | 0 | 0 |
| Entregar anticipo | − importe | 0 | 0 | 0 | + importe |
| Registrar comprobante | 0 | 0 | 0 | 0 | − comprobado |
| Recibir devolución | + devolución | 0 | 0 | 0 | − devolución |
| Enviar remesa | + principal + comisión | 0 | 0 | − principal | 0 |
| Pagar remesa | − principal | 0 | 0 | + principal | 0 |
| Solicitar o aprobar cierre | 0 | 0 | 0 | 0 | 0 |

El cambio entregado al cliente no forma parte del ingreso de la venta. Si una
venta cuesta 125 y el cliente entrega 200, el cajón esperado aumenta 125, no 200.

## Reglas combinadas

1. `efectivo esperado = apertura + ventas + remesas enviadas con comisión - remesas pagadas - anticipos entregados + devoluciones de anticipos - fajillas selladas`.
2. Una fajilla sellada sale del cajón y entra a custodia. El efectivo controlado
   no cambia: sólo cambia su ubicación.
3. Un comprobante liquida responsabilidad, pero no mueve efectivo.
4. Un anticipo pendiente no bloquea el cierre. La caja puede cerrar cuadrada si
   cuenta el efectivo físico correcto; el anticipo permanece abierto para otro
   turno.
5. Una devolución posterior entra al turno que físicamente la recibe, no altera
   retroactivamente el turno que entregó el anticipo.
6. `comprobado + devuelto` nunca puede superar lo entregado.
7. Una devolución puede bloquearse si rebasa el límite de efectivo del cajón;
   primero debe sellarse una fajilla.
8. La fajilla nunca puede ser mayor al efectivo esperado disponible.
9. Una venta sólo confirma si existen todos los productos y suficiente stock.
   Venta, inventario, recibo y libro de caja se guardan atómicamente.
10. Sólo una caja puede entregar el anticipo y sólo una puede pagar cada remesa.
11. Cajeros y supervisores están limitados a su sucursal; Administrador y
    Finanzas operan con alcance global según sus permisos.
12. Una diferencia mayor a la tolerancia deja el cierre pendiente de aprobación.

## Recorridos manuales prioritarios

| ID | Recorrido | Resultado esperado |
| --- | --- | --- |
| QA-01 | Apertura 1,000; venta 500; conteo 1,500 | Cierre cuadrado sin revisión |
| QA-02 | Apertura 1,000; ventas 1,500; fajilla 1,000; conteo 1,500 | Cierre cuadrado; fajilla 1,000 en custodia |
| QA-03 | Esperado 1,500; conteo 1,450 | Faltante 50 y cierre pendiente |
| QA-04 | Esperado 1,500; conteo 1,550 | Sobrante 50 y cierre pendiente |
| QA-05 | Diferencia exacta dentro de tolerancia | Cierra sin aprobación |
| QA-06 | Autorizar anticipo 400 sin entregarlo | Cajón sin cambio; estado Autorizado |
| QA-07 | Entregar 400; comprobar 250; contar caja correctamente | Cierra cuadrada; anticipo queda pendiente por 150 |
| QA-08 | Entregar 400; comprobar 250; devolver 150 | Estado Liquidado; el cajón recupera 150 |
| QA-09 | Cerrar con anticipo pendiente y devolverlo en otro turno | El retorno aparece sólo en el segundo turno |
| QA-10 | Intentar comprobar o devolver más del saldo pendiente | Operación rechazada sin movimientos parciales |
| QA-11 | Devolución que rebasa el límite del cajón | Bloqueada hasta sellar una fajilla |
| QA-12 | Venta con stock exacto | Venta confirmada e inventario termina en cero |
| QA-13 | Venta sin stock o con efectivo insuficiente | Todo se rechaza; inventario y caja sin cambios |
| QA-14 | Enviar remesa entre Centro y Roma | Cajón recibe principal + comisión; fondeo registra sólo principal |
| QA-15 | Pagar la remesa en destino y volver a intentarlo | Primer pago válido; segundo pago rechazado |
| QA-16 | Operador de Roma intenta usar un movimiento de Centro | No se muestra en UI y el API lo rechaza |
| QA-17 | Supervisor sin delegación intenta sellar fajilla o aprobar cierre | Acción oculta y rechazada por API |
| QA-18 | Finanzas revisa el tablero después de todos los movimientos | Totales por tienda, actores, roles y libros separados |

## Límites actuales que no deben confundirse con pruebas fallidas

- No existe todavía un movimiento genérico de ajuste manual de efectivo.
- Administración puede cambiar la existencia actual de un producto, pero aún no
  existe un kardex de ajustes de inventario con motivo y movimientos inversos.
- El flujo de venta implementado actualmente procesa efectivo; tarjeta y pago
  mixto continúan fuera de este corte funcional.

Esos tres puntos requieren funcionalidad adicional antes de poder validarse como
flujos completos.

## Automatización

Las pruebas automáticas cubren cálculos monetarios, denominaciones, tolerancias,
límites, ventas, consolidación de cantidades, inventario, fajillas, remesas,
anticipos, fondeo, roles, permisos y combinaciones de cierre. Los recorridos
manuales anteriores validan además integración visual, navegación y claridad de
los resultados.

El corte actual contiene **85 pruebas unitarias/de integración** y **7 recorridos
E2E**: 92 verificaciones en total. El detalle, el aislamiento de datos y la
revisión responsive/accesible están documentados en
[`testing.md`](testing.md).
