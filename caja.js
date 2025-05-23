// Configuración de Parse (Back4App)
Parse.initialize("9wHPW3a7Mh0PM3GkuJRvmiapxXVUuDtKtddXOuZP", "G0DWFnk38owCePCVEINEj3qpJSgvNjnWZccUUQtm"); // Reemplaza con tus credenciales
Parse.serverURL = 'https://parseapi.back4app.com/';

// Clase para manejar la caja chica
class CajaMatrimonios {
    constructor() {
        this.entradas = [];
        this.gastos = [];
        this.passwordCorrecta = "eveyoct";
        this.cargandoDatos = false;
        this.cargarDatos();
    }

    async cargarDatos() {
        if (this.cargandoDatos) return;
        this.cargandoDatos = true;

        try {
            const transactionsList = document.getElementById("transactions-list");
            transactionsList.innerHTML = `
                <div class="loading-transactions">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Cargando datos...</p>
                </div>
            `;

            // Cargar entradas con reintentos
            let entradasCargadas = false;
            let intentos = 0;
            let lastError = null;

            while (!entradasCargadas && intentos < 3) {
                try {
                    const queryEntradas = new Parse.Query("CajaMatrimonios");
                    queryEntradas.equalTo("tipo", "entrada");
                    queryEntradas.descending("fecha");
                    this.entradas = await queryEntradas.find();
                    entradasCargadas = true;
                } catch (error) {
                    lastError = error;
                    intentos++;
                    if (intentos >= 3) break;
                    await new Promise(resolve => setTimeout(resolve, 1000 * intentos));
                }
            }

            if (!entradasCargadas) {
                throw lastError || new Error("Error al cargar entradas");
            }

            // Cargar gastos con reintentos
            let gastosCargados = false;
            intentos = 0;
            lastError = null;

            while (!gastosCargados && intentos < 3) {
                try {
                    const queryGastos = new Parse.Query("CajaMatrimonios");
                    queryGastos.equalTo("tipo", "gasto");
                    queryGastos.descending("fecha");
                    this.gastos = await queryGastos.find();
                    gastosCargados = true;
                } catch (error) {
                    lastError = error;
                    intentos++;
                    if (intentos >= 3) break;
                    await new Promise(resolve => setTimeout(resolve, 1000 * intentos));
                }
            }

            if (!gastosCargados) {
                throw lastError || new Error("Error al cargar gastos");
            }

            this.actualizarResumen();
            this.mostrarTransacciones();
        } catch (error) {
            console.error("Error al cargar datos:", error);

            const transactionsList = document.getElementById("transactions-list");
            transactionsList.innerHTML = `
                <div class="error-loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar los datos</p>
                    <p class="error-detail">${error.message}</p>
                    <button id="reload-data">Reintentar</button>
                </div>
            `;

            document.getElementById('reload-data').addEventListener('click', () => {
                this.cargarDatos();
            });
        } finally {
            this.cargandoDatos = false;
        }
    }

    async verificarPassword() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'password-modal';
            modal.innerHTML = `
                <div class="password-modal-content">
                    <h3>Autenticación Requerida</h3>
                    <p>Ingrese la contraseña para continuar:</p>
                    <input type="password" id="password-input" placeholder="Contraseña" autocomplete="off">
                    <div class="password-modal-buttons">
                        <button id="password-cancel">Cancelar</button>
                        <button id="password-confirm">Aceptar</button>
                    </div>
                    <p id="password-error" class="error-message"></p>
                </div>
            `;
            document.body.appendChild(modal);

            const passwordInput = document.getElementById('password-input');
            const confirmBtn = document.getElementById('password-confirm');
            const cancelBtn = document.getElementById('password-cancel');
            const errorMsg = document.getElementById('password-error');

            const cleanUp = () => {
                confirmBtn.removeEventListener('click', confirmHandler);
                cancelBtn.removeEventListener('click', cancelHandler);
                document.body.removeChild(modal);
            };

            const confirmHandler = () => {
                if (passwordInput.value === this.passwordCorrecta) {
                    cleanUp();
                    resolve(true);
                } else {
                    errorMsg.textContent = 'Contraseña incorrecta. Intente nuevamente.';
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            };

            const cancelHandler = () => {
                cleanUp();
                resolve(false);
            };

            confirmBtn.addEventListener('click', confirmHandler);
            cancelBtn.addEventListener('click', cancelHandler);

            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmHandler();
                }
            });

            passwordInput.focus();
        });
    }

    async agregarEntrada(monto, concepto, fecha) {
        try {
            const autenticado = await this.verificarPassword();
            if (!autenticado) return false;

            const CajaMatrimonios = Parse.Object.extend("CajaMatrimonios");
            const nuevaEntrada = new CajaMatrimonios();

            // Corregido: Manejo correcto de la fecha considerando la zona horaria
            const fechaObj = new Date(fecha);
            const fechaCorregida = new Date(fechaObj.getTime() + Math.abs(fechaObj.getTimezoneOffset() * 60000));

            nuevaEntrada.set("tipo", "entrada");
            nuevaEntrada.set("monto", parseFloat(monto));
            nuevaEntrada.set("concepto", concepto);
            nuevaEntrada.set("fecha", fechaCorregida);

            const resultado = await nuevaEntrada.save();
            this.entradas.unshift(resultado);

            this.actualizarResumen();
            this.mostrarTransacciones(); // Actualización inmediata del historial

            this.mostrarExito("Entrada registrada correctamente");
            return true;
        } catch (error) {
            console.error("Error al agregar entrada:", error);
            this.mostrarError("Error al registrar la entrada. Intenta nuevamente.");
            return false;
        }
    }

    async agregarGasto(monto, concepto, fecha) {
        try {
            const autenticado = await this.verificarPassword();
            if (!autenticado) return false;

            const saldoActual = this.calcularSaldoCaja();
            if (parseFloat(monto) > saldoActual) {
                this.mostrarError("No hay suficiente saldo en caja para este gasto");
                return false;
            }

            const CajaMatrimonios = Parse.Object.extend("CajaMatrimonios");
            const nuevoGasto = new CajaMatrimonios();

            // Corregido: Manejo correcto de la fecha considerando la zona horaria
            const fechaObj = new Date(fecha);
            const fechaCorregida = new Date(fechaObj.getTime() + Math.abs(fechaObj.getTimezoneOffset() * 60000));

            nuevoGasto.set("tipo", "gasto");
            nuevoGasto.set("monto", parseFloat(monto));
            nuevoGasto.set("concepto", concepto);
            nuevoGasto.set("fecha", fechaCorregida);

            const resultado = await nuevoGasto.save();
            this.gastos.unshift(resultado);

            this.actualizarResumen();
            this.mostrarTransacciones(); // Actualización inmediata del historial

            this.mostrarExito("Gasto registrado correctamente");
            return true;
        } catch (error) {
            console.error("Error al agregar gasto:", error);
            this.mostrarError("Error al registrar el gasto. Intenta nuevamente.");
            return false;
        }
    }

    async eliminarMovimiento(movimiento) {
        try {
            const autenticado = await this.verificarPassword();
            if (!autenticado) return false;

            const confirmar = confirm(`¿Estás seguro que deseas eliminar este movimiento?\nConcepto: ${movimiento.get("concepto")}\nMonto: ${this.formatearMoneda(movimiento.get("monto"))}`);

            if (!confirmar) return false;

            await movimiento.destroy();

            if (movimiento.get("tipo") === "entrada") {
                this.entradas = this.entradas.filter(e => e.id !== movimiento.id);
            } else {
                this.gastos = this.gastos.filter(g => g.id !== movimiento.id);
            }

            this.actualizarResumen();
            this.mostrarTransacciones();

            this.mostrarExito("Movimiento eliminado correctamente");
            return true;
        } catch (error) {
            console.error("Error al eliminar movimiento:", error);
            this.mostrarError("Error al eliminar el movimiento. Intenta nuevamente.");
            return false;
        }
    }

    calcularTotalEntradas() {
        return this.entradas.reduce((total, entrada) => total + entrada.get("monto"), 0);
    }

    calcularTotalGastos() {
        return this.gastos.reduce((total, gasto) => total + gasto.get("monto"), 0);
    }

    calcularSaldoCaja() {
        return this.calcularTotalEntradas() - this.calcularTotalGastos();
    }

    actualizarResumen() {
        document.getElementById("total-entradas").textContent = this.formatearMoneda(this.calcularTotalEntradas());
        document.getElementById("total-gastos").textContent = this.formatearMoneda(this.calcularTotalGastos());
        document.getElementById("saldo-caja").textContent = this.formatearMoneda(this.calcularSaldoCaja());
    }

    formatearMoneda(valor) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        }).format(valor);
    }

    formatearFecha(fecha) {
        // Corregido: Usar la fecha directamente sin ajustes de zona horaria para visualización
        const fechaObj = new Date(fecha);
        return fechaObj.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    obtenerNombreMes(fecha) {
        const meses = [
            'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
        ];
        return meses[new Date(fecha).getMonth()];
    }

    mostrarTransacciones() {
        const filterType = document.getElementById("filter-type").value;
        const filterMonth = document.getElementById("filter-month").value;
        const filterSearch = document.getElementById("filter-search").value.toLowerCase();
        const showAllMonths = document.getElementById("show-all-months").checked;

        let todasTransacciones = [];

        if (filterType === 'all' || filterType === 'entrada') {
            this.entradas.forEach(entrada => {
                todasTransacciones.push({
                    tipo: 'entrada',
                    objeto: entrada,
                    fecha: entrada.get("fecha"),
                    concepto: entrada.get("concepto"),
                    monto: entrada.get("monto")
                });
            });
        }

        if (filterType === 'all' || filterType === 'gasto') {
            this.gastos.forEach(gasto => {
                todasTransacciones.push({
                    tipo: 'gasto',
                    objeto: gasto,
                    fecha: gasto.get("fecha"),
                    concepto: gasto.get("concepto"),
                    monto: gasto.get("monto")
                });
            });
        }

        todasTransacciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let transaccionesFiltradas = todasTransacciones;

        if (filterSearch) {
            transaccionesFiltradas = transaccionesFiltradas.filter(t =>
                t.concepto.toLowerCase().includes(filterSearch)
            );
        }

        if (filterMonth && !showAllMonths) {
            const [year, month] = filterMonth.split('-');
            transaccionesFiltradas = transaccionesFiltradas.filter(t => {
                const fecha = new Date(t.fecha);
                return fecha.getFullYear() === parseInt(year) &&
                       (fecha.getMonth() + 1) === parseInt(month);
            });
        }

        const transactionsList = document.getElementById("transactions-list");
        transactionsList.innerHTML = '';

        if (transaccionesFiltradas.length === 0) {
            transactionsList.innerHTML = `
                <div class="no-transactions">
                    <i class="fas fa-info-circle"></i>
                    <p>No hay transacciones que coincidan con los filtros</p>
                </div>
            `;
            return;
        }

        transaccionesFiltradas.forEach(transaccion => {
            const transactionElement = document.createElement('div');
            transactionElement.className = `transaction transaction-${transaccion.tipo}`;

            const fecha = this.formatearFecha(transaccion.fecha);
            const montoFormateado = this.formatearMoneda(transaccion.monto);

            transactionElement.innerHTML = `
                <div class="transaction-actions">
                    <button class="btn-delete" data-id="${transaccion.objeto.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                <div class="transaction-info">
                    <div class="transaction-concept">${transaccion.concepto}</div>
                    <div class="transaction-date">${fecha}</div>
                </div>
                <div class="transaction-amount amount-${transaccion.tipo}">
                    ${transaccion.tipo === 'entrada' ? '+' : '-'}${montoFormateado}
                </div>
            `;

            transactionsList.appendChild(transactionElement);
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');

                let movimiento = this.entradas.find(e => e.id === id);
                if (!movimiento) {
                    movimiento = this.gastos.find(g => g.id === id);
                }

                if (movimiento) {
                    await this.eliminarMovimiento(movimiento);
                }
            });
        });
    }

    generarReportePDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const logoUrl = 'https://i.ibb.co/ymKMmF5Z/IMG-20250507-WA0014.jpg';
        const img = new Image();
        img.src = logoUrl;

        img.onload = () => {
            doc.addImage(img, 'PNG', 15, 10, 30, 30);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('MATRIMONIOS DE NAZARET', 50, 20);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text('Parroquia de San Bartolomé Apóstol', 50, 27);
            doc.text('Otzolotepec, México', 50, 34);

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Reporte de Caja Chica', 105, 45, { align: 'center' });

            const fechaActual = new Date();
            doc.setFontSize(10);
            doc.text(`Generado el: ${fechaActual.toLocaleDateString('es-MX')}`, 185, 15, { align: 'right' });

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('RESUMEN', 15, 55);

            doc.setFont('helvetica', 'normal');
            doc.text(`Total Entradas: ${this.formatearMoneda(this.calcularTotalEntradas())}`, 15, 65);
            doc.text(`Total Gastos: ${this.formatearMoneda(this.calcularTotalGastos())}`, 15, 75);
            doc.text(`Saldo en Caja: ${this.formatearMoneda(this.calcularSaldoCaja())}`, 15, 85);

            const filterType = document.getElementById("filter-type").value;
            const filterMonth = document.getElementById("filter-month").value;
            const filterSearch = document.getElementById("filter-search").value.toLowerCase();
            const showAllMonths = document.getElementById("show-all-months").checked;

            let transaccionesParaPDF = [];

            if (filterType === 'all' || filterType === 'entrada') {
                this.entradas.forEach(entrada => {
                    const concepto = entrada.get("concepto").toLowerCase();
                    const fecha = new Date(entrada.get("fecha"));

                    if (filterSearch && !concepto.includes(filterSearch)) {
                        return;
                    }

                    if (filterMonth && !showAllMonths) {
                        const [year, month] = filterMonth.split('-');
                        if (fecha.getFullYear() !== parseInt(year) ||
                            (fecha.getMonth() + 1) !== parseInt(month)) {
                            return;
                        }
                    }

                    transaccionesParaPDF.push({
                        tipo: 'Entrada',
                        fecha: this.formatearFecha(entrada.get("fecha")),
                        concepto: entrada.get("concepto"),
                        monto: entrada.get("monto")
                    });
                });
            }

            if (filterType === 'all' || filterType === 'gasto') {
                this.gastos.forEach(gasto => {
                    const concepto = gasto.get("concepto").toLowerCase();
                    const fecha = new Date(gasto.get("fecha"));

                    if (filterSearch && !concepto.includes(filterSearch)) {
                        return;
                    }

                    if (filterMonth && !showAllMonths) {
                        const [year, month] = filterMonth.split('-');
                        if (fecha.getFullYear() !== parseInt(year) ||
                            (fecha.getMonth() + 1) !== parseInt(month)) {
                            return;
                        }
                    }

                    transaccionesParaPDF.push({
                        tipo: 'Gasto',
                        fecha: this.formatearFecha(gasto.get("fecha")),
                        concepto: gasto.get("concepto"),
                        monto: -gasto.get("monto")
                    });
                });
            }

            transaccionesParaPDF.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DE MOVIMIENTOS', 15, 100);

            let tituloTabla = 'Todas las transacciones';
            if (filterType !== 'all') {
                tituloTabla = filterType === 'entrada' ? 'Entradas' : 'Gastos';
            }

            if (filterMonth && !showAllMonths) {
                const [year, month] = filterMonth.split('-');
                const fechaMes = new Date(`${year}-${month}-01`);
                const nombreMes = this.obtenerNombreMes(fechaMes);
                tituloTabla += ` - ${nombreMes} ${year}`;
            } else if (!showAllMonths) {
                tituloTabla += ' - Todos los meses';
            }

            if (filterSearch) {
                tituloTabla += ` - Filtro: "${filterSearch}"`;
            }

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(tituloTabla, 15, 105);

            if (transaccionesParaPDF.length > 0) {
                const headers = [['Tipo', 'Fecha', 'Concepto', 'Monto']];
                const data = transaccionesParaPDF.map(t => [
                    t.tipo,
                    t.fecha,
                    t.concepto,
                    { content: this.formatearMoneda(t.monto), styles: { halign: 'right' } }
                ]);

                doc.autoTable({
                    startY: 110,
                    head: headers,
                    body: data,
                    margin: { left: 15 },
                    headStyles: {
                        fillColor: [92, 107, 192],
                        textColor: 255,
                        fontStyle: 'bold'
                    },
                    alternateRowStyles: {
                        fillColor: [240, 240, 240]
                    },
                    columnStyles: {
                        0: { cellWidth: 25 },
                        1: { cellWidth: 30 },
                        3: { cellWidth: 30, halign: 'right' }
                    },
                    styles: {
                        fontSize: 9,
                        cellPadding: 3
                    },
                    didDrawPage: function(data) {
                        doc.setFontSize(8);
                        const pageCount = doc.internal.getNumberOfPages();
                        doc.text(`Página ${data.pageNumber} de ${pageCount}`, 195, doc.internal.pageSize.height - 10, { align: 'right' });
                    }
                });
            } else {
                doc.setFontSize(10);
                doc.text('No hay movimientos que coincidan con los filtros aplicados', 15, 110);
            }

            const fileName = `Reporte_Caja_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
        };
    }

    mostrarExito(mensaje) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${mensaje}</span>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(toast);
                }, 300);
            }, 3000);
        }, 100);
    }

    mostrarError(mensaje) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${mensaje}</span>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(toast);
                }, 300);
            }, 3000);
        }, 100);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    const caja = new CajaMatrimonios();

    // Configurar fecha actual por defecto en los formularios
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-entrada').value = today;
    document.getElementById('fecha-gasto').value = today;

    // Configurar mes actual por defecto en el filtro
    const currentMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('filter-month').value = currentMonth;

    // Crear checkbox para mostrar todos los meses (seleccionado por defecto)
    const filtersContainer = document.querySelector('.filters');
    const allMonthsCheckbox = document.createElement('div');
    allMonthsCheckbox.className = 'filter-group';
    allMonthsCheckbox.innerHTML = `
        <label for="show-all-months">
            <input type="checkbox" id="show-all-months" checked>
            Mostrar todos los meses
        </label>
    `;
    filtersContainer.appendChild(allMonthsCheckbox);

    // Estilos para el modal de contraseña
    const passwordModalStyles = document.createElement('style');
    passwordModalStyles.textContent = `
    .password-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    }

    .password-modal-content {
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        width: 300px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }

    .password-modal-content h3 {
        margin-top: 0;
        color: var(--primary-color);
    }

    .password-modal-content input[type="password"] {
        width: 100%;
        padding: 10px;
        margin: 10px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    .password-modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 15px;
    }

    .password-modal-buttons button {
        padding: 8px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    #password-confirm {
        background-color: var(--primary-color);
        color: white;
    }

    #password-cancel {
        background-color: #f0f0f0;
    }

    .error-message {
        color: var(--danger-color);
        font-size: 0.9em;
        margin-top: 5px;
        min-height: 18px;
    }
    `;
    document.head.appendChild(passwordModalStyles);

    // Estilos para carga y errores
    const loadingStyles = document.createElement('style');
    loadingStyles.textContent = `
    .loading-transactions {
        text-align: center;
        padding: 30px;
        color: #666;
    }

    .loading-transactions i {
        font-size: 2rem;
        margin-bottom: 15px;
        color: var(--primary-color);
        animation: spin 1s linear infinite;
    }

    .error-loading {
        text-align: center;
        padding: 30px;
        color: var(--danger-color);
    }

    .error-loading i {
        font-size: 2rem;
        margin-bottom: 15px;
    }

    .error-detail {
        font-size: 0.9em;
        margin: 10px 0;
        color: #666;
    }

    #reload-data {
        margin-top: 15px;
        padding: 8px 20px;
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    #reload-data:hover {
        opacity: 0.9;
        transform: translateY(-1px);
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    `;
    document.head.appendChild(loadingStyles);

    // Estilos para los toasts
    const toastStyles = document.createElement('style');
    toastStyles.textContent = `
    .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .toast.show {
        opacity: 1;
        transform: translateX(0);
    }

    .toast-success {
        background-color: #4CAF50;
    }

    .toast-error {
        background-color: #F44336;
    }

    .toast i {
        font-size: 1.2rem;
    }

    .btn-delete {
        background: none;
        border: none;
        color: #F44336;
        cursor: pointer;
        font-size: 1rem;
        padding: 5px;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
    }

    .btn-delete:hover {
        background-color: rgba(244, 67, 54, 0.1);
        transform: scale(1.1);
    }

    .transaction-actions {
        margin-right: 10px;
        display: flex;
        align-items: center;
    }

    .filter-group label {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
    }

    .filter-group input[type="checkbox"] {
        width: 16px;
        height: 16px;
    }
    `;
    document.head.appendChild(toastStyles);

    // Event listeners
    document.getElementById('form-entrada').addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = document.getElementById('monto-entrada').value;
        const concepto = document.getElementById('concepto-entrada').value;
        const fecha = document.getElementById('fecha-entrada').value;

        if (!monto || !concepto || !fecha) {
            caja.mostrarError('Todos los campos son requeridos');
            return;
        }

        const success = await caja.agregarEntrada(monto, concepto, fecha);

        if (success) {
            document.getElementById('form-entrada').reset();
            document.getElementById('fecha-entrada').value = today;
        }
    });

    document.getElementById('form-gasto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = document.getElementById('monto-gasto').value;
        const concepto = document.getElementById('concepto-gasto').value;
        const fecha = document.getElementById('fecha-gasto').value;

        if (!monto || !concepto || !fecha) {
            caja.mostrarError('Todos los campos son requeridos');
            return;
        }

        const success = await caja.agregarGasto(monto, concepto, fecha);

        if (success) {
            document.getElementById('form-gasto').reset();
            document.getElementById('fecha-gasto').value = today;
        }
    });

    document.getElementById('filter-type').addEventListener('change', () => {
        caja.mostrarTransacciones();
    });

    document.getElementById('filter-month').addEventListener('change', () => {
        caja.mostrarTransacciones();
    });

    document.getElementById('filter-search').addEventListener('input', () => {
        caja.mostrarTransacciones();
    });

    document.getElementById('show-all-months').addEventListener('change', () => {
        caja.mostrarTransacciones();
    });

    document.getElementById('generar-pdf').addEventListener('click', () => {
        caja.generarReportePDF();
    });
});
