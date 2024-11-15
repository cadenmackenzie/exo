import Foundation
import UIKit

class WorkerManager: ObservableObject {
    private var worker: ExoWorker?
    @Published var isRunning = false
    @Published var statusMessage = "Ready"
    
    init() {
        print("WorkerManager initialized")
    }
    
    func startWorker() {
        stopWorker()
        let workerID = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        
        worker = ExoWorker(endpoint: "http://10.0.0.224:8000", workerID: workerID)
        isRunning = true
        statusMessage = "Starting..."
        
        Task { [weak self] in
            do {
                try await self?.worker?.registerWorker()
                await MainActor.run {
                    self?.statusMessage = "Registered"
                }
            } catch {
                print("Registration error: \(error)")
                if let urlError = error as? URLError {
                    print("URL Error: \(urlError.localizedDescription)")
                }
                await MainActor.run {
                    self?.statusMessage = "Failed to register: \(error.localizedDescription)"
                    self?.isRunning = false
                }
            }
        }
    }
    
    func stopWorker() {
        worker?.stop()
        worker = nil
        isRunning = false
        statusMessage = "Stopped"
    }
}
