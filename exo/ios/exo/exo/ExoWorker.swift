import Foundation
import CoreML
import UIKit

class ExoWorker {
    private let endpoint: String
    private var isRunning = false
    private var workerID: String
    
    init(endpoint: String, workerID: String) {
        self.endpoint = endpoint
        self.workerID = workerID
    }
    
    func registerWorker() async throws {
        print("Attempting to register with server at \(endpoint)")
        let registration: [String: Any] = [
            "worker_id": workerID,
            "device_type": "ios",
            "model": UIDevice.current.model,
            "system_version": UIDevice.current.systemVersion,
            "capabilities": getDeviceCapabilities()
        ]
        
        guard let url = URL(string: "\(endpoint)/worker/register") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        request.httpMethod = "GET"
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if httpResponse.statusCode != 200 {
            print("Registration failed with status: \(httpResponse.statusCode)")
            if let errorData = String(data: data, encoding: .utf8) {
                print("Server response: \(errorData)")
            }
            throw URLError(.badServerResponse)
        }
        print("Successfully registered worker")
    }
    
    func startHeartbeat() async {
        isRunning = true
        while isRunning {
            do {
                try await sendHeartbeat()
                try await Task.sleep(nanoseconds: 5_000_000_000)
            } catch {
                print("Heartbeat error: \(error)")
            }
        }
    }
    
    func startPolling() async {
        isRunning = true
        while isRunning {
            do {
                if let job = try await pollForJob() {
                    try await processJob(job)
                }
                try await Task.sleep(nanoseconds: 1_000_000_000)
            } catch {
                print("Polling error: \(error)")
            }
        }
    }
    
    func stop() {
        isRunning = false
    }
    
    private func getDeviceCapabilities() -> [String: Any] {
        // Report device capabilities
        return [
            "compute_units": ProcessInfo.processInfo.processorCount,
            "memory": ProcessInfo.processInfo.physicalMemory,
            "has_neural_engine": true,  // All modern iOS devices have Neural Engine
            "platform": "ios",
            "architecture": "arm64"
        ]
    }
    
    private func sendHeartbeat() async throws {
        guard let url = URL(string: "\(endpoint)/worker/heartbeat/\(workerID)") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        request.httpMethod = "POST"
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    private func pollForJob() async throws -> [String: Any]? {
        guard let url = URL(string: "\(endpoint)/worker/job/\(workerID)") else {
            throw URLError(.badURL)
        }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            if (response as? HTTPURLResponse)?.statusCode != 404 {  // 404 is normal for no jobs
                print("Job poll failed with status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            }
            return nil
        }
        print("Received new job from server")
        return try JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
    
    private func processJob(_ job: [String: Any]) async throws {
        // Process the job based on its type
        guard let jobType = job["type"] as? String else { return }
        
        switch jobType {
        case "inference":
            try await handleInference(job)
        case "training":
            try await handleTraining(job)
        default:
            print("Unknown job type: \(jobType)")
        }
    }
    
    private func handleInference(_ job: [String: Any]) async throws {
        // Implementation for handling inference jobs
        // This would integrate with CoreML for actual processing
    }
    
    private func handleTraining(_ job: [String: Any]) async throws {
        // Implementation for handling training jobs
        // This would integrate with CoreML for actual processing
    }
}
