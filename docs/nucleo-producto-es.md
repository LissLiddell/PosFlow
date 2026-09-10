# Núcleo de producto de PosFlow

Estado: **MVP funcional en feature freeze**. Este documento describe lo que la
demostración actual sí implementa y distingue sus extensiones futuras.

PosFlow y Mercado Lucerna son ficticios. Ningún código, dato, diseño, marca,
texto o documento propietario de una empresa real fue reutilizado.

## Promesa del producto

PosFlow es una plataforma de punto de venta y control de efectivo para una
operación con varias sucursales. Conecta las ventas, los límites del cajón, la
custodia mediante fajillas, las remesas, los anticipos operativos y el cierre
ciego en un historial explicable.

No intenta ser solamente una pantalla de cobro. Su pregunta central es:

> ¿Dónde está el dinero, por qué cambió y quién fue responsable de cada
> movimiento?

## Problema que resuelve

Una venta puede quedar registrada correctamente y aun así dejar a Supervisión y
Finanzas conciliando por separado:

- el efectivo que debería existir físicamente;
- los retiros del cajón y su custodia;
- las comisiones y obligaciones de una remesa;
- el dinero entregado como anticipo y todavía no comprobado;
- las diferencias entre el conteo físico y el saldo esperado;
- la autorización de excepciones.

PosFlow convierte esas reglas operativas en validaciones antes de ejecutar la
operación y conserva evidencia después de terminarla.

## Usuarios y responsabilidades

| Rol | Responsabilidad |
| --- | --- |
| **Administrador** | Configura productos, existencias actuales, límites y tolerancias por caja. Decide qué facultades delega al Supervisor. Puede preparar/sellar fajillas, aprobar cierres, autorizar anticipos y consultar Finanzas. |
| **Finanzas** | Consulta los saldos consolidados, autoriza anticipos y registra comprobaciones de gasto. No opera el cajón. |
| **Supervisor** | Puede abrir, vender, operar remesas y anticipos, y cerrar como respaldo. Gestiona fajillas o aprueba diferencias sólo cuando Administración lo delegó en esa caja. |
| **Cajero** | Abre y opera su propio turno: vende, envía/paga remesas, entrega anticipos autorizados, recibe devoluciones y realiza el conteo ciego. No configura ni aprueba sus excepciones. |

Las opciones ajenas al rol no aparecen en la navegación. Aunque una persona
intente saltarse la interfaz, la API vuelve a validar rol, empresa, sucursal,
propiedad del turno, estado y delegación.

## Conceptos del dominio

### Caja y turno

Una **caja** es un punto configurable dentro de una sucursal. Contiene límite de
efectivo, tolerancia de cierre, estado activo y delegaciones al Supervisor.

Un **turno** es la sesión operativa de una caja. Comienza con un fondo inicial,
recibe movimientos de efectivo y termina con un conteo por denominaciones. Una
caja no puede tener dos turnos activos simultáneos.

### Venta

La venta contiene productos, cantidades y una fotografía histórica de nombre,
SKU y precio. El MVP procesa efectivo. El servidor verifica productos activos,
existencias, importe recibido, cambio y límite del cajón antes de confirmar.

Venta, reducción de inventario, secuencia del recibo, pago, asiento de caja y
auditoría se guardan juntos dentro de una transacción serializable.

### Fajilla

Una **fajilla** es efectivo contado por denominación que se prepara para retirarlo
del cajón y mantenerlo bajo custodia.

```text
BORRADOR → SELLADA
```

- El borrador puede editarse.
- Una fajilla no puede superar el efectivo esperado disponible.
- Sellarla resta su total del cajón y lo suma a la custodia.
- Una fajilla sellada queda bloqueada para edición.
- Este control es independiente de las remesas de clientes.

Los estados posteriores `EN CUSTODIA SEGURA` y `TRANSFERIDA` están modelados
como extensión, pero no tienen una acción visible en este MVP.

### Remesa

Una **remesa** permite que una persona entregue dinero en una sucursal y un
beneficiario lo cobre una sola vez en otra sucursal de la red ficticia.

Al enviar:

- la caja de origen recibe principal más comisión;
- la operación valida destino, datos, importe y límite del cajón;
- se genera una referencia única;
- el libro de fondeo registra la obligación por el principal.

Al pagar:

- se valida referencia, últimos cuatro dígitos, destino y disponibilidad;
- la caja debe tener efectivo esperado suficiente;
- sale únicamente el principal;
- el fondeo registra el derecho de compensación de la tienda pagadora;
- un cambio condicional de estado impide el doble pago.

```text
DISPONIBLE → PAGADA
```

La comisión demostrativa es 3% con mínimo de MXN 20.00. El principal permitido
va de MXN 100.00 a MXN 20,000.00.

### Anticipo

Un **anticipo** es dinero autorizado para que una persona empleada o proveedora
cubra un propósito operativo.

```text
AUTORIZADO → ABIERTO → PARCIAL → LIQUIDADO
```

- Autorizarlo no mueve efectivo.
- Caja lo entrega desde un turno abierto y el cajón disminuye.
- Una comprobación reduce la responsabilidad, pero no mueve efectivo.
- Una devolución reduce la responsabilidad y entra al cajón que la recibe.
- Comprobaciones más devoluciones nunca pueden superar lo entregado.
- El anticipo puede quedar pendiente después del cierre y continuar en otro
  turno.
- Una versión de concurrencia evita que dos liquidaciones desactualizadas gasten
  el mismo saldo pendiente.

### Cierre ciego y excepción

El operador cuenta por denominaciones sin recibir del sistema el saldo que debe
imitar. Al enviar:

```text
diferencia = efectivo contado - efectivo esperado
```

Si el valor absoluto de la diferencia está dentro de la tolerancia, el turno
cierra. Si la rebasa, queda `PENDIENTE DE REVISIÓN`.

La aprobación registra a la persona autorizada y cierra el turno, pero conserva
el conteo y la diferencia originales.

## Los dos libros

### Libro de efectivo físico

Responde: **¿cuánto dinero debería existir dentro del cajón?**

```text
fondo inicial
+ ventas en efectivo
+ principal y comisión de remesas enviadas
- pagos de remesas
- anticipos entregados
+ devoluciones de anticipos
- fajillas selladas
= efectivo esperado en el cajón
```

### Libro de fondeo

Responde: **¿qué debe compensarse entre la tienda y la red de remesas?**

- Envío: la tienda recibió principal y queda una obligación negativa.
- Pago: la tienda entregó principal y obtiene una posición positiva.

El fondeo nunca se suma al efectivo controlado. Es una cuenta por compensar, no
otro montón de billetes.

## Ejemplo completo verificable

```text
Apertura                                  + $2,000
Venta de Vela cedro                        +   $189
Remesa enviada: principal $300 + comisión  +   $320
Fajilla sellada                            - $1,000
---------------------------------------------------
Efectivo esperado                          = $1,509
Conteo físico                              = $1,500
Diferencia                                 =    -$9
```

El cierre queda pendiente cuando la tolerancia configurada es menor a MXN 9.00.
La aprobación posterior conserva ese `-$9` en el informe.

## Reglas que no pueden romperse

1. Todos los importes se calculan y almacenan en centavos enteros.
2. Una caja sólo puede tener un turno activo.
3. No existe venta, remesa, entrega/devolución de anticipo o cierre sin un turno
   abierto autorizado.
4. Un Cajero sólo opera su sucursal y su propio turno.
5. Un Supervisor necesita delegación por caja para fajillas y cierres.
6. El saldo esperado se deriva del libro; no se captura manualmente.
7. Una venta se guarda completa o no modifica nada.
8. Una remesa disponible sólo puede pagarse una vez y en su destino.
9. Un anticipo sólo puede entregarse una vez.
10. Una liquidación no puede superar el saldo pendiente.
11. Una fajilla sellada y un conteo enviado conservan su historia.
12. Las operaciones que aumentarían el cajón respetan su límite.
13. Toda consulta protegida permanece dentro de la empresa y sucursal autorizada.
14. Efectivo, custodia, fondeo y responsabilidad de anticipos no se mezclan.

## Alcance implementado

- Inicio de sesión demostrativo con cuatro roles y dos sucursales.
- Productos, categorías, existencias actuales y configuración de cajas.
- Apertura, venta en efectivo, carrito, cambio, recibo e inventario.
- Límite preventivo de efectivo.
- Preparación, edición y sellado de fajillas.
- Envío/pago de remesas y fondeo separado.
- Autorización, entrega, comprobación, devolución y liquidación de anticipos.
- Conteo ciego, tolerancia, revisión, aprobación e informe de cierre.
- Tablero consolidado de Finanzas y actividad con actor/rol.
- Auditoría para operaciones sensibles.
- Diseño adaptable y navegación accesible.
- 92 verificaciones automáticas.

## Límites intencionales del MVP

No se implementaron:

- tarjetas o pagos mixtos reales;
- banco o proveedor real de remesas;
- CFDI o facturación fiscal;
- cancelaciones, devoluciones o ajustes genéricos;
- kardex completo de inventario;
- hardware de caja, impresión o escaneo;
- modo sin conexión o múltiples monedas;
- contabilidad, nómina o cumplimiento de una operación financiera real.

Los estados de extensión que aparecen en el esquema no se presentan como
funcionalidad terminada.

## Documentos relacionados

- [Arquitectura y decisiones técnicas](architecture.md)
- [Modelo relacional](data-model.md)
- [Referencia REST](api.md)
- [Pruebas y accesibilidad](testing.md)
- [Matriz de QA](matriz-qa-es.md)
