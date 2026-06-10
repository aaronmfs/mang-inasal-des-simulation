import simpy


class ResourceManager:
    def __init__(self, env: simpy.Environment, capacity: int) -> None:
        self.resource: simpy.Resource = simpy.Resource(env, capacity=capacity)

    def request(self) -> simpy.Request:
        return self.resource.request()
