// Solo se importan las piezas de ECharts que se usan (el resto no entra en el paquete).
import * as echarts from 'echarts/core'
import { BarChart, LineChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, AriaComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart, LineChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, AriaComponent,
  CanvasRenderer
])

export { echarts }
