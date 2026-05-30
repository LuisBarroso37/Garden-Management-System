export interface IrrigationCommand {
  type: 'START_WATERING' | 'STOP_WATERING';
  plantId: string;
  gardenId: string;
  timestamp: string;
  durationSeconds?: number;
}

export interface IrrigationConnector {
  sendCommand(command: IrrigationCommand): Promise<void>;
}

export const createMockIrrigationConnector = (): IrrigationConnector => ({
  async sendCommand(command: IrrigationCommand): Promise<void> {
    console.info(
      `[IRRIGATION] ${command.type} plant=${command.plantId} garden=${command.gardenId} at=${command.timestamp}${command.durationSeconds ? ` duration=${command.durationSeconds} seconds` : ''}`,
    );
  },
});

export const irrigationConnector = createMockIrrigationConnector();
